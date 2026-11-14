import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import { getCurrentUserLocation } from "../services/locationService";

const KEY = "cp_city";
const EXACT_KEY = "cp_exact_location";
const TITLE_KEY = "cp_location_title";
const CHOICE_KEY = "cp_city_choice"; // 'all' when user explicitly chooses 'All locations'
const COORDS_KEY = "cp_location_coords"; // {lat,lng} of the chosen / detected location
const SOURCE_KEY = "cp_location_source"; // "manual" when the person picked the place themselves

// Opening the app (or coming back to it) re-detects the location, at most this often.
const REFRESH_EVERY_MS = 10 * 60 * 1000;
let lastDetectedAt = 0;

// Whether to quietly re-detect the current location now: location access is already granted
// (this never prompts), nothing is detecting, it wasn't just done, and the person hasn't picked a
// place themselves (a picked place is kept until they change it).
export async function shouldRefreshLocation() {
  if (globalDetecting || Date.now() - lastDetectedAt < REFRESH_EVERY_MS) return false;
  try {
    if ((await AsyncStorage.getItem(SOURCE_KEY)) === "manual") return false;
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

// Position of the chosen location, so searches can list nearby properties first.
let globalCoords = null;
let coordsLoaded = false;
const coordsOf = (lat, lng) => {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0) ? { lat: a, lng: b } : null;
};
function saveCoords(coords) {
  globalCoords = coords || null;
  coordsLoaded = true;
  if (globalCoords) AsyncStorage.setItem(COORDS_KEY, JSON.stringify(globalCoords)).catch(() => {});
  else AsyncStorage.removeItem(COORDS_KEY).catch(() => {});
}

// Where "nearby" is measured from for a search: the chosen / detected location, else the phone's
// last known position when location access is already granted (never prompts). Null if neither.
export async function getSearchOrigin() {
  if (!coordsLoaded) {
    try {
      const saved = JSON.parse((await AsyncStorage.getItem(COORDS_KEY)) || "null");
      if (!coordsLoaded) globalCoords = coordsOf(saved?.lat, saved?.lng);
    } catch {
      // unreadable: fall through to the phone's position
    }
    coordsLoaded = true;
  }
  if (globalCoords) return globalCoords;
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const last = await Promise.race([
      Location.getLastKnownPositionAsync({ maxAge: 60 * 60 * 1000 }),
      new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    return last ? coordsOf(last.coords.latitude, last.coords.longitude) : null;
  } catch {
    return null;
  }
}

// Shared in-memory listeners so when LocationScreen updates location, HomeScreen immediately re-renders!
const listeners = new Set();
function notifyListeners(state) {
  listeners.forEach((listener) => listener(state));
}

let globalCity = "";
let globalExactLocation = "";
let globalFullAddress = "";
let globalLocationTitle = "";
let globalDetecting = false;

// Sign-out: forget the previous person's location in memory (storage is cleared by the caller).
export function resetCityState() {
  globalCity = "";
  globalExactLocation = "";
  globalFullAddress = "";
  globalLocationTitle = "";
  globalCoords = null;
  coordsLoaded = false;
  lastDetectedAt = 0;
  notifyListeners({ city: "", exactLocation: "", fullAddress: "", locationTitle: "" });
}

export function useCity(availableCities = []) {
  const [city, setCityState] = useState(globalCity);
  const [exactLocation, setExactLocationState] = useState(globalExactLocation);
  const [fullAddress, setFullAddressState] = useState(globalFullAddress);
  const [locationTitle, setLocationTitleState] = useState(globalLocationTitle);
  const [detectingLocation, setDetectingLocation] = useState(globalDetecting);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const handleUpdate = (data) => {
      if (data.city !== undefined) setCityState(data.city);
      if (data.exactLocation !== undefined) setExactLocationState(data.exactLocation);
      if (data.fullAddress !== undefined) setFullAddressState(data.fullAddress);
      if (data.locationTitle !== undefined) setLocationTitleState(data.locationTitle);
      if (data.detectingLocation !== undefined) setDetectingLocation(data.detectingLocation);
    };
    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  // Fetch live current location. `gpsOnly` (silent refreshes): keep the current location unless a
  // real GPS fix came back, so a weak signal never swaps the locality for a rough IP-based city.
  const fetchCurrentLocation = useCallback(
    async (citiesToMatch = availableCities, { gpsOnly = false } = {}) => {
      globalDetecting = true;
      setDetectingLocation(true);
      notifyListeners({ detectingLocation: true });

      try {
        const result = await getCurrentUserLocation(citiesToMatch, !gpsOnly);
        if (gpsOnly && result?.source !== "gps") return null;
        if (result && (result.city || result.exactLocation || result.fullAddress)) {
          if (result.source === "gps") lastDetectedAt = Date.now();
          const newCity = result.city || "";
          const newFull = result.fullAddress || result.exactLocation || result.city || "";
          const newTitle = result.title || (newFull ? newFull.split(",")[0].trim() : newCity);

          globalCity = newCity;
          globalExactLocation = newFull;
          globalFullAddress = newFull;
          globalLocationTitle = newTitle;
          saveCoords(coordsOf(result.latitude, result.longitude));

          setCityState(newCity);
          setExactLocationState(newFull);
          setFullAddressState(newFull);
          setLocationTitleState(newTitle);

          await Promise.all([
            AsyncStorage.setItem(KEY, newCity),
            AsyncStorage.setItem(EXACT_KEY, newFull),
            AsyncStorage.setItem(TITLE_KEY, newTitle),
            AsyncStorage.removeItem(CHOICE_KEY),
            AsyncStorage.removeItem(SOURCE_KEY),
          ]);

          notifyListeners({
            city: newCity,
            exactLocation: newFull,
            fullAddress: newFull,
            locationTitle: newTitle,
            detectingLocation: false,
          });

          return {
            city: newCity,
            exactLocation: newFull,
            fullAddress: newFull,
            locationTitle: newTitle,
            latitude: globalCoords?.lat,
            longitude: globalCoords?.lng,
          };
        }
      } catch (err) {
        console.log("[useCity] Location auto-detect error:", err?.message);
        throw err;
      } finally {
        globalDetecting = false;
        setDetectingLocation(false);
        notifyListeners({ detectingLocation: false });
      }
      return null;
    },
    [availableCities]
  );

  useEffect(() => {
    let active = true;

    async function loadInitialLocation() {
      try {
        const [savedCity, savedExact, savedTitle, savedChoice] = await Promise.all([
          AsyncStorage.getItem(KEY),
          AsyncStorage.getItem(EXACT_KEY),
          AsyncStorage.getItem(TITLE_KEY),
          AsyncStorage.getItem(CHOICE_KEY),
        ]);

        if (!active) return;

        // If user already saved a location
        if (savedCity || savedExact) {
          const c = (savedCity || "").trim();
          const e = (savedExact || savedCity || "").trim();
          const t = (savedTitle || (e ? e.split(",")[0].trim() : c) || "").trim();

          globalCity = c;
          globalExactLocation = e;
          globalFullAddress = e;
          globalLocationTitle = t;

          setCityState(c);
          setExactLocationState(e);
          setFullAddressState(e);
          setLocationTitleState(t);
          setInitialized(true);
          return;
        }

        // If user explicitly chose "All locations"
        if (savedChoice === "all") {
          globalCity = "";
          globalExactLocation = "";
          globalFullAddress = "";
          globalLocationTitle = "";
          setCityState("");
          setExactLocationState("");
          setFullAddressState("");
          setLocationTitleState("");
          setInitialized(true);
          return;
        }

        // Neither is saved -> Auto-detect location on first launch!
        globalDetecting = true;
        setDetectingLocation(true);
        notifyListeners({ detectingLocation: true });

        try {
          // Pass requestIfMissing = false so HomeScreen NEVER shows an intrusive permission prompt on mount!
          const res = await getCurrentUserLocation(availableCities, false);
          if (active && res && (res.city || res.exactLocation || res.fullAddress)) {
            const newCity = res.city || "";
            const newFull = res.fullAddress || res.exactLocation || res.city || "";
            const newTitle = res.title || (newFull ? newFull.split(",")[0].trim() : newCity);
            if (res.source === "gps") lastDetectedAt = Date.now();

            globalCity = newCity;
            globalExactLocation = newFull;
            globalFullAddress = newFull;
            globalLocationTitle = newTitle;
            saveCoords(coordsOf(res.latitude, res.longitude));

            setCityState(newCity);
            setExactLocationState(newFull);
            setFullAddressState(newFull);
            setLocationTitleState(newTitle);

            await Promise.all([
              AsyncStorage.setItem(KEY, newCity),
              AsyncStorage.setItem(EXACT_KEY, newFull),
              AsyncStorage.setItem(TITLE_KEY, newTitle),
            ]);

            notifyListeners({
              city: newCity,
              exactLocation: newFull,
              fullAddress: newFull,
              locationTitle: newTitle,
              detectingLocation: false,
            });
          }
        } catch (e) {
          console.log("[useCity] Initial auto-fetch skipped/failed:", e?.message);
        } finally {
          if (active) {
            globalDetecting = false;
            setDetectingLocation(false);
            notifyListeners({ detectingLocation: false });
          }
        }
      } catch (err) {
        console.log("[useCity] Storage load error:", err?.message);
      } finally {
        if (active) setInitialized(true);
      }
    }

    loadInitialLocation();

    return () => {
      active = false;
    };
  }, []);

  const setCity = useCallback((c) => {
    const trimmed = (c || "").trim();
    globalCity = trimmed;
    globalExactLocation = trimmed;
    globalFullAddress = trimmed;
    globalLocationTitle = trimmed;
    saveCoords(null);

    setCityState(trimmed);
    setExactLocationState(trimmed);
    setFullAddressState(trimmed);
    setLocationTitleState(trimmed);

    if (trimmed) {
      AsyncStorage.setItem(KEY, trimmed).catch(() => {});
      AsyncStorage.setItem(EXACT_KEY, trimmed).catch(() => {});
      AsyncStorage.setItem(TITLE_KEY, trimmed).catch(() => {});
      AsyncStorage.removeItem(CHOICE_KEY).catch(() => {});
    } else {
      AsyncStorage.removeItem(KEY).catch(() => {});
      AsyncStorage.removeItem(EXACT_KEY).catch(() => {});
      AsyncStorage.removeItem(TITLE_KEY).catch(() => {});
      AsyncStorage.setItem(CHOICE_KEY, "all").catch(() => {});
      AsyncStorage.setItem(SOURCE_KEY, "manual").catch(() => {}); // chose "All locations"
    }
    notifyListeners({
      city: trimmed,
      exactLocation: trimmed,
      fullAddress: trimmed,
      locationTitle: trimmed,
    });
  }, []);

  // `coords` ({ lat, lng }) when the picked place has a known position.
  const setLocation = useCallback((exactLoc, cityName, title, coords) => {
    const trimmedExact = (exactLoc || "").trim();
    let trimmedCity = (cityName || "").trim();

    if (!trimmedCity && trimmedExact) {
      // If no city provided, extract the last comma-separated part or whole
      const parts = trimmedExact.split(",").map((p) => p.trim());
      trimmedCity = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    }

    const trimmedTitle = (title || (trimmedExact ? trimmedExact.split(",")[0].trim() : trimmedCity) || "").trim();

    globalCity = trimmedCity;
    globalExactLocation = trimmedExact;
    globalFullAddress = trimmedExact;
    globalLocationTitle = trimmedTitle;
    saveCoords(trimmedExact ? coordsOf(coords?.lat, coords?.lng) : null);
    // Picked by hand: opening the app keeps it instead of re-detecting.
    AsyncStorage.setItem(SOURCE_KEY, "manual").catch(() => {});

    setCityState(trimmedCity);
    setExactLocationState(trimmedExact);
    setFullAddressState(trimmedExact);
    setLocationTitleState(trimmedTitle);

    if (trimmedExact) {
      AsyncStorage.setItem(EXACT_KEY, trimmedExact).catch(() => {});
      AsyncStorage.setItem(KEY, trimmedCity).catch(() => {});
      AsyncStorage.setItem(TITLE_KEY, trimmedTitle).catch(() => {});
      AsyncStorage.removeItem(CHOICE_KEY).catch(() => {});
    } else {
      AsyncStorage.removeItem(KEY).catch(() => {});
      AsyncStorage.removeItem(EXACT_KEY).catch(() => {});
      AsyncStorage.removeItem(TITLE_KEY).catch(() => {});
      AsyncStorage.setItem(CHOICE_KEY, "all").catch(() => {});
    }
    notifyListeners({
      city: trimmedCity,
      exactLocation: trimmedExact,
      fullAddress: trimmedExact,
      locationTitle: trimmedTitle,
    });
  }, []);

  return [
    city,
    setCity,
    {
      exactLocation,
      fullAddress,
      locationTitle,
      setLocation,
      detectingLocation,
      fetchCurrentLocation,
      initialized,
    },
  ];
}
