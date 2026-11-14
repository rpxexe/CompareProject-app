import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, FlatList, Image, RefreshControl, StyleSheet, View, useWindowDimensions } from "react-native";
import Re, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { isReducedMotion } from "../hooks/useReducedMotion";
import { splashDoneAt, useSplashDone } from "../utils/splashGate";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import Screen from "../components/Screen";
import GlassView from "../components/GlassView";
import HeartButton from "../components/HeartButton";
import MiniBarChart from "../components/MiniBarChart";
import MiniLineChart from "../components/MiniLineChart";
import LoanCalculatorSheet from "../components/LoanCalculatorSheet";
import PressableScale from "../components/PressableScale";
import { Cover } from "../components/PropertyCard";
import HomeHero from "../components/home/HomeHero";
import CompareIcon from "../components/CompareIcon";
import { ErrorState, LoadingState } from "../components/StateViews";
import { useAuth } from "../context/AuthContext";
import { useLocationAccess } from "../context/LocationAccessContext";
import { useApi } from "../hooks/useApi";
import { shouldRefreshLocation, useCity } from "../hooks/useCity";
import { api } from "../services/api";
import { bhkLabel, bhkSummary, formatInr, fromPrice, listingName as cardName, timeAgo } from "../utils/format";
import PriceFrom from "../components/PriceFrom";
import {
  clearCompareHistory,
  clearSearchHistory,
  getCompareHistory,
  getSearchHistory,
  subscribeCompareHistory,
  subscribeSearchHistory,
} from "../services/historyService";
import { useCompare } from "../context/CompareContext";
import { useSaved } from "../context/SavedContext";
import { useNetwork } from "../context/NetworkContext";
import BottomSheet from "../components/BottomSheet";
import { brand, colors, fonts, gradients, radius, surfaces } from "../theme";
import Text from "../components/AppText";

const HERO_IMAGE = require("../../assets/onboarding_residence.jpg");
const safe = (p) => p.catch(() => null);

// Shortcut tiles under the hero; each shows a live count of what it opens.
const ACTIVITY = [
  { key: "wishlist", label: "Wishlist", icon: "heart-outline" },
  { key: "compared", label: "Compares", icon: "compare" }, // drawn with the nav bar's CompareIcon
  { key: "recent", label: "Searches", icon: "time-outline" },
];

// Short axis labels; the chart readout shows the full stage name.
const STAGE_SHORT = { "Ready To Move": "Ready", "Under Construction": "U/C", "New Launch": "New" };

function stageBadge(p) {
  const s = `${p.possessionStatus || ""} ${p.propertyGroup || ""}`;
  if (/upcoming/i.test(s)) return { text: "Upcoming", bg: "#FFF1D6", fg: "#9A6100" };
  if (/new\s*launch|pre[-\s]?launch/i.test(s)) return { text: "New Launch", bg: "#FFE9D6", fg: "#B4530A" };
  if (/under\s*construction/i.test(s)) return { text: "Under Construction", bg: "#E8F1FF", fg: "#2F5FC4" };
  return { text: "Launching Soon", bg: "#FFF1D6", fg: "#9A6100" };
}

const bhkLine = (p) =>
  [bhkLabel(p.bhk), p.propertyType ? p.propertyType.replace(/^Flats\/Apartments$/i, "Apartments") : ""]
    .filter(Boolean)
    .join(" ");

const placeLine = (p) => [p.locality, p.city].filter(Boolean).join(", ");

// ---------------------------------------------------------------------------------------------
// Motion below the hero: each section plays one short intro fade after the splash, then stays put.
// Nothing moves with scrolling: no parallax and no scroll-linked fades (the hero parallax slid the
// cards over the search bar, and scroll fades hid sections). Don't bring back JS-driven,
// per-element springs either: they felt choppy.
const FADE_START = 900; // ms after the splash goes: just as the hero's search bar lands
const FADE_STEP = 70; // between sections, in page order
const FADE_MS = 280;
// One animated layer per section. `order` is its place on the page: hidden while the splash is up,
// then fades in on a shared timeline (a section whose data arrives later fades in right away).
function Fade({ order = 0, style, children }) {
  const intro = useSplashDone();
  const reduced = isReducedMotion();
  const enter = useSharedValue(reduced ? 1 : 0);
  // Hardware layer only during the intro fade (stops shadow flicker on Android), then dropped so
  // the rails inside scroll without it.
  const [layer, setLayer] = useState(!reduced);
  useEffect(() => {
    if (!intro || reduced) return undefined;
    const delay = Math.max(0, splashDoneAt() + FADE_START + order * FADE_STEP - Date.now());
    enter.value = withDelay(delay, withTiming(1, { duration: FADE_MS, easing: Easing.out(Easing.cubic) }));
    const t = setTimeout(() => setLayer(false), delay + FADE_MS + 60);
    return () => clearTimeout(t);
  }, [intro]); // eslint-disable-line react-hooks/exhaustive-deps

  const a = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 8 }],
  }));
  return (
    <Re.View renderToHardwareTextureAndroid={layer} style={[style, a]}>
      {children}
    </Re.View>
  );
}

function SectionTitle({ title, action, onAction }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <PressableScale onPress={onAction} hitSlop={10} style={styles.viewAll} accessibilityRole="button">
          <Text style={styles.viewAllText}>{action}</Text>
          <Ionicons name="arrow-forward" size={14} color={brand.violet} />
        </PressableScale>
      ) : null}
    </View>
  );
}

// "RERA" seal for the photo's top-left corner: an emerald pill with a white tick disc and a soft glow.
function ReraTag() {
  return (
    <View style={styles.rera} accessibilityLabel="RERA approved">
      <LinearGradient colors={["#22D38A", "#0E9F6E", "#0B7A55"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.reraTick}>
        <Ionicons name="checkmark" size={11} color="#0B7A55" />
      </View>
      <Text style={styles.reraText}>RERA</Text>
    </View>
  );
}

// Photo inset in a rounded card (RERA seal top-left, heart top-right), name, price + place, small
// stats, then "Compare Now" and an open-details arrow.
const FeaturedCard = React.memo(function FeaturedCard({ p, width, onOpen }) {
  const name = cardName(p);
  const place = placeLine(p);
  const from = fromPrice(p);
  const multi = (p.projectUnits || 1) > 1;
  const { has, toggle } = useCompare();
  const inCompare = has(p.id);
  return (
    <PressableScale
      to={0.98}
      onPress={() => onOpen(p)}
      style={[styles.fCard, { width }]}
      accessibilityRole="button"
      accessibilityLabel={[name, p.reraNumber && "RERA registered", from && `starting from ${from}`, place, bhkSummary(p), !multi && p.area].filter(Boolean).join(", ")}
    >
      <View style={[styles.fImageWrap, { height: Math.round((width - 16) * 0.8) }]}>
        <Cover uri={p.image} style={StyleSheet.absoluteFill} iconSize={32} />
        {p.reraNumber ? <ReraTag /> : null}
        <HeartButton id={p.id} size={16} style={styles.fHeart} />
      </View>
      <View style={styles.fBody}>
        <View style={styles.fNameRow}>
          <Text style={styles.fTitle} numberOfLines={1}>
            {name}
          </Text>
        </View>
        {/* Starting price on its own line, then the place. */}
        <View style={styles.fDesc}>
          {from ? <PriceFrom value={from} style={styles.fPrice} labelStyle={styles.fPriceLabel} /> : null}
          <Text style={styles.fPlace} numberOfLines={1}>{place}</Text>
        </View>
        <View style={styles.fFoot}>
          {bhkSummary(p) ? <Stat icon="bed-outline" text={bhkSummary(p)} /> : null}
          {/* Area differs per unit, so a project with several units leaves it to the details. */}
          {p.area && !multi ? <Stat icon="resize-outline" text={p.area} /> : null}
        </View>
        <View style={styles.fActions}>
          <PressableScale
            to={0.94}
            onPress={(e) => {
              e?.stopPropagation?.();
              toggle(p.id);
            }}
            style={styles.fCompare}
            accessibilityRole="button"
            accessibilityLabel={inCompare ? `Remove ${name} from compare` : `Compare ${name}`}
          >
            {/* Only the fill changes between states (Added = a flat lavender "gradient"); the
                border stays. Dropping the border when an item left compare broke the button's
                clipping on Android and the whole button went blank. */}
            <LinearGradient
              colors={inCompare ? [brand.lavender, brand.lavender] : gradients.cta}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fCompareFill}
            >
              <Ionicons name={inCompare ? "checkmark-circle" : "swap-horizontal"} size={15} color={inCompare ? brand.violet : colors.white} />
              <Text style={[styles.fCompareText, inCompare && { color: brand.violet }]}>{inCompare ? "Added to Compare" : "Compare Now"}</Text>
            </LinearGradient>
          </PressableScale>
          <View style={styles.fPill} accessibilityElementsHidden importantForAccessibility="no">
            <Ionicons name="arrow-forward" size={16} color={brand.ink} />
          </View>
        </View>
      </View>
    </PressableScale>
  );
});

function Stat({ icon, text }) {
  return (
    <View style={styles.fStat}>
      <Ionicons name={icon} size={13} color={brand.inkSoft} />
      <Text style={styles.fStatText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const UpcomingCard = React.memo(function UpcomingCard({ p, onOpen }) {
  const badge = stageBadge(p);
  return (
    <PressableScale to={0.98} onPress={() => onOpen(p)} style={styles.uCard} accessibilityRole="button" accessibilityLabel={`${cardName(p)}, ${badge.text}, ${placeLine(p)}`}>
      <Cover uri={p.image} style={styles.uImage} iconSize={20} />
      <View style={styles.uBody}>
        <View style={[styles.uBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.uBadgeText, { color: badge.fg }]} numberOfLines={1}>
            {badge.text}
          </Text>
        </View>
        <Text style={styles.uTitle} numberOfLines={1}>
          {cardName(p)}
        </Text>
        <Text style={styles.uMeta} numberOfLines={1}>
          {placeLine(p)}
        </Text>
        {bhkSummary(p) ? <Text style={styles.uMeta}>{bhkSummary(p)}</Text> : null}
      </View>
    </PressableScale>
  );
});

export default function HomeScreen({ navigation }) {
  const { token, openLoginPrompt } = useAuth();
  const { width: W } = useWindowDimensions();
  const [city, setCity, { detectingLocation, fetchCurrentLocation, locationTitle }] = useCity();
  const { promptOnLaunch } = useLocationAccess();
  const [selectedLocality, setSelectedLocality] = useState("");
  const [searchHistory, setSearchHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);
  const [loanSheet, setLoanSheet] = useState(null); // null | "emi" | "eligibility"
  const [recentOpen, setRecentOpen] = useState(false);
  const [compareHistory, setCompareHistory] = useState([]);
  const [comparedOpen, setComparedOpen] = useState(false);
  const cmp = useCompare();
  const saved = useSaved();
  // The hero's tilt sensor and rolling text pause while the hero is scrolled fully off screen; its
  // one-off logo stretch and bell ring follow `focused` only, so scrolling back up doesn't replay them.
  const [heroOnScreen, setHeroOnScreen] = useState(true);
  const focused = useIsFocused();

  // Whether the hero is still on screen, from a plain throttled scroll callback that only sets state
  // when the hero crosses the top edge. Not a Reanimated scroll handler: measured on a budget phone
  // (Realme RMX3710), running a worklet on every scroll event made 22-29% of scroll frames janky
  // (slow UI thread); with the plain ScrollView it was 2-3%.
  const heroH = useRef(0);
  const onScroll = useCallback((e) => {
    const visible = heroH.current === 0 || e.nativeEvent.contentOffset.y < heroH.current;
    setHeroOnScreen((was) => (was === visible ? was : visible));
  }, []);

  const cardW = Math.min(Math.round((W - 40) / 1.55), 250);

  // On opening the app: location skipped or blocked at onboarding (or GPS switched off) -> ask once
  // per session; access already on -> quietly re-detect the current location. Coming back to the
  // app later re-detects too (at most every few minutes; a place picked by hand is kept).
  useEffect(() => {
    const refresh = async (justGranted) => {
      if (justGranted) return fetchCurrentLocation().catch(() => {});
      if (await shouldRefreshLocation()) fetchCurrentLocation(undefined, { gpsOnly: true }).catch(() => {});
    };
    const t = setTimeout(() => {
      promptOnLaunch().then(refresh);
    }, 900);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh(false);
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getSearchHistory().then(setSearchHistory).catch(() => {});
    return subscribeSearchHistory(setSearchHistory);
  }, []);

  useEffect(() => {
    getCompareHistory().then(setCompareHistory).catch(() => {});
    return subscribeCompareHistory(setCompareHistory);
  }, []);

  // Load a past comparison back into the compare tray and open the Compare tab.
  const reopenComparison = (item) => {
    setComparedOpen(false);
    cmp.replace(item.ids);
    navigation.navigate("Compare", { screen: "CompareMain" });
  };

  // Real unread count (signed-in users only); refreshed whenever Home regains focus.
  const loadUnread = useCallback(() => {
    if (!token) return setUnread(0);
    api.notifications().then((r) => setUnread(r?.unreadCount || 0)).catch(() => {});
  }, [token]);
  useEffect(() => {
    loadUnread();
    return navigation.addListener("focus", loadUnread);
  }, [navigation, loadUnread]);

  const { data, loading, error, reload, refresh } = useApi(async () => {
    const base = {};
    if (city) base.city = city;
    if (selectedLocality) base.locality = selectedLocality;
    const [featured, recent, launch, upcoming, insights] = await Promise.all([
      safe(api.properties({ ...base, featured: true, limit: 8 })),
      api.properties({ ...base, limit: 8 }),
      safe(api.properties({ ...base, section: "new-launch", limit: 6 })),
      safe(api.properties({ ...base, section: "upcoming", limit: 6 })),
      safe(api.insights(city)),
    ]);
    return { featured, recent, launch, upcoming, insights };
  }, [city, selectedLocality]);

  // When the connection comes back, reload anything that failed while offline.
  const { onReconnect } = useNetwork();
  const reloadRef = useRef(null);
  reloadRef.current = () => {
    refresh();
    loadUnread();
  };
  useEffect(() => onReconnect(() => reloadRef.current?.()), [onReconnect]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadUnread()]);
    setRefreshing(false);
  };

  const openProperty = useCallback((p) => navigation.navigate("PropertyDetails", { id: p.id, preview: p }), [navigation]);

  // No property in the data is flagged "featured" yet, so fall back to the latest listings and
  // title the rail honestly rather than calling them featured.
  const featuredItems = data?.featured?.items?.length ? data.featured.items : data?.recent?.items || [];
  const featuredTitle = data?.featured?.items?.length ? "Featured Properties" : city ? `Latest in ${city}` : "Latest Properties";

  const upcomingItems = useMemo(() => {
    const seen = new Set();
    // One card per project, even when it's both "upcoming" and a "new launch".
    const key = (p) => p.projectKey || p.id;
    return [...(data?.upcoming?.items || []), ...(data?.launch?.items || [])].filter((p) => !seen.has(key(p)) && seen.add(key(p))).slice(0, 8);
  }, [data]);

  const insights = data?.insights;
  const priceData = (insights?.priceByBhk || []).map((b) => ({ label: bhkLabel(b.bhk), value: b.medianPrice }));
  const stageData = (insights?.listingsByStage || []).map((s) => ({ label: s.stage, short: STAGE_SHORT[s.stage] || s.stage, value: s.listings }));

  const runSearch = (params) => {
    navigation.navigate("Search", { city: city || "", locality: selectedLocality || "", ...params });
  };

  // The search bar opens the full search form (context tabs, location, filters).
  const openSearch = (context) =>
    navigation.navigate("SearchFilters", { city: city || "", locality: selectedLocality || "", ...(context ? { context } : {}) });

  const rerunSearch = (item) => {
    if (item.city && item.city !== city) setCity(item.city);
    navigation.navigate("Search", {
      city: item.city || city || "",
      locality: item.locality || "",
      search: item.query || "",
      propertyType: item.propertyType || "",
      bhk: item.bhk || "",
    });
  };

  const onQuickAction = (key) => {
    if (key === "wishlist") {
      if (token) navigation.navigate("Saved");
      else openLoginPrompt({ reason: "general", title: "Sign In to See Your Wishlist", message: "Sign in to save properties and find them here on any device." });
    } else if (key === "compared") {
      setComparedOpen(true);
    } else if (key === "recent") {
      setRecentOpen(true);
    }
  };

  // The resume card: the most specific place searched as the title, the other filters as tags.
  const lastSearch = searchHistory[0];
  const resumeTitle = lastSearch ? lastSearch.query || lastSearch.locality || lastSearch.city || lastSearch.label : "";
  const resumeTags = lastSearch
    ? [bhkLabel(lastSearch.bhk), lastSearch.propertyType, lastSearch.city !== resumeTitle && lastSearch.city]
        .filter(Boolean)
        .slice(0, 3)
    : [];


  return (
    <Screen
      onScroll={onScroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.violet} colors={[brand.violet]} />}
    >
      <View onLayout={(e) => (heroH.current = e.nativeEvent.layout.height)}>
      <HomeHero
        city={city}
        // Area within the city (GPS suburb or the place picked on the Location screen), if any.
        locality={selectedLocality || (locationTitle && locationTitle !== city ? locationTitle : "")}
        detecting={detectingLocation}
        unread={unread}
        focused={focused}
        onScreen={heroOnScreen}
        onLocation={() => navigation.navigate("Location")}
        onNotifications={() => navigation.navigate("Notification")}
        onSearch={openSearch}
      />
      </View>

      <Fade order={0} style={styles.activityRow}>
        {ACTIVITY.map((a) => {
          // Wishlist needs an account; guests see a dash instead of a count.
          const count = a.key === "wishlist" ? (token ? saved?.count ?? 0 : null) : a.key === "compared" ? compareHistory.length : searchHistory.length;
          return (
            <View key={a.key} style={styles.activityCell}>
              <PressableScale
                to={0.95}
                onPress={() => onQuickAction(a.key)}
                style={styles.activityTile}
                accessibilityRole="button"
                accessibilityLabel={count == null ? `${a.label}, sign in to see` : `${a.label}, ${count}`}
              >
                {/* Icon on the left, count on the right (inset from the edge), both centred vertically. */}
                <View style={styles.activityTop}>
                  <View style={styles.activityIcon}>
                    {a.icon === "compare" ? <CompareIcon size={18} color={brand.violet} /> : <Ionicons name={a.icon} size={17} color={brand.violet} />}
                  </View>
                  <Text style={styles.activityCount} maxFontSizeMultiplier={1.2}>
                    {count == null ? "—" : count > 99 ? "99+" : String(count)}
                  </Text>
                </View>
                <Text style={styles.activityLabel} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {a.label}
                </Text>
              </PressableScale>
            </View>
          );
        })}
      </Fade>

      {/* Only once there is a search to go back to: where, the filters used, and when. */}
      {lastSearch ? (
        <Fade order={1} style={styles.resumeWrap}>
          <PressableScale
            to={0.98}
            onPress={() => rerunSearch(lastSearch)}
            style={styles.resume}
            accessibilityRole="button"
            accessibilityLabel={`Pick up your search: ${lastSearch.label || lastSearch.query}`}
          >
            <View style={styles.resumeBorder} />
            <View style={styles.resumeBody}>
              <Text style={styles.resumeKicker} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {`Pick up your search${lastSearch.timestamp ? `  ·  ${timeAgo(lastSearch.timestamp)}` : ""}`}
              </Text>
              {/* One line: the place in bold, then the filters used. */}
              <Text style={styles.resumeLine} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                <Text style={styles.resumeTitle}>{resumeTitle}</Text>
                {resumeTags.length ? <Text style={styles.resumeTags}>{resumeTags.map((t) => `  ·  ${t}`).join("")}</Text> : null}
              </Text>
            </View>
            <LinearGradient colors={gradients.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.resumeGo}>
              <Ionicons name="arrow-forward" size={17} color={colors.white} />
            </LinearGradient>
          </PressableScale>
        </Fade>
      ) : null}

      {loading && !data ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
          <LoadingState rows={3} />
        </View>
      ) : error && !data ? (
        <ErrorState title="Unable to load properties" error={error} onRetry={reload} />
      ) : (
        <>
          {featuredItems.length ? (
            <Fade order={2} style={styles.section}>
              <SectionTitle title={featuredTitle} action="View All" onAction={() => runSearch(data?.featured?.items?.length ? { featured: true } : {})} />
              <FlatList
                horizontal
                data={featuredItems}
                keyExtractor={(i) => i.id}
                showsHorizontalScrollIndicator={false}
                // Mount only what's near the screen at first; the rest renders as you swipe.
                initialNumToRender={3}
                maxToRenderPerBatch={3}
                windowSize={5}
                // Settle on a whole card after a swipe (card width + the rail's 12pt gap).
                snapToInterval={cardW + 12}
                decelerationRate="fast"
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => <FeaturedCard p={item} width={cardW} onOpen={openProperty} />}
              />
            </Fade>
          ) : null}

          {/* Home loan banner: opens the eligibility calculator (estimates, no lender offers). */}
          <Fade order={3}>
          <PressableScale to={0.99} onPress={() => setLoanSheet("eligibility")} style={styles.loan} accessibilityRole="button" accessibilityLabel="Get your home loan easily. Check eligibility">
            <LinearGradient colors={["#F9FCFC", "#F4F9FA"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={styles.loanImage}>
              <Image source={HERO_IMAGE} style={StyleSheet.absoluteFill} resizeMode="cover" />
            </View>
            <LinearGradient
              colors={["#F8FBFC", "rgba(248, 251, 252, 0.7)", "rgba(248, 251, 252, 0)"]}
              locations={[0, 0.4, 0.75]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.loanText}>
              <Text style={styles.loanTitle}>
                Get Your{"\n"}
                <Text style={{ color: brand.violet }}>Home Loan Easily</Text>
              </Text>
              <Text style={styles.loanSub}>Estimate your EMI and how much you could borrow — in seconds.</Text>
            </View>
            <View style={styles.loanSide}>
              <GlassView level="strong" borderRadius={12} style={styles.loanChip}>
                <Text style={styles.loanChipSmall}>Free estimate</Text>
                <Text style={styles.loanChipBig}>No sign-up</Text>
              </GlassView>
              <View style={styles.loanBtn}>
                <Text style={styles.loanBtnText}>Check Eligibility</Text>
                <Ionicons name="arrow-forward" size={13} color={brand.ink} />
              </View>
            </View>
          </PressableScale>
          </Fade>

          {upcomingItems.length ? (
            <Fade order={4} style={styles.section}>
              <SectionTitle title="Upcoming Properties" action="View All" onAction={() => navigation.navigate("NewProject")} />
              <FlatList
                horizontal
                data={upcomingItems}
                keyExtractor={(i) => `u_${i.id}`}
                showsHorizontalScrollIndicator={false}
                // Mount only what's near the screen at first; the rest renders as you swipe.
                initialNumToRender={3}
                maxToRenderPerBatch={3}
                windowSize={5}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => <UpcomingCard p={item} onOpen={openProperty} />}
              />
            </Fade>
          ) : null}

          <Fade order={5}>
          <PressableScale to={0.99} onPress={() => setLoanSheet("emi")} style={styles.emiCard} accessibilityRole="button" accessibilityLabel="EMI calculator. Calculate your monthly EMI">
            <LinearGradient colors={gradients.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emiIcon}>
              <Ionicons name="calculator" size={22} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.emiTitle}>EMI Calculator</Text>
              <Text style={styles.emiSub}>Calculate your monthly EMI and plan your budget.</Text>
            </View>
            <View style={styles.emiBtn}>
              <Text style={styles.emiBtnText}>Calculate EMI</Text>
              <Ionicons name="arrow-forward" size={13} color={brand.violet} />
            </View>
          </PressableScale>
          </Fade>

          {priceData.length || stageData.some((s) => s.value > 0) ? (
            <Fade order={6} style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  Market Analytics
                </Text>
                <PressableScale onPress={() => navigation.navigate("Location")} style={styles.marketCity} accessibilityRole="button" accessibilityLabel={`Market: ${city || "All India"}. Change city`}>
                  <Text style={styles.marketCityText}>{city || "All India"}</Text>
                  <Ionicons name="chevron-down" size={12} color={brand.ink} />
                </PressableScale>
              </View>
              <View style={styles.chartsRow}>
                {priceData.length ? (
                  <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>Price by BHK</Text>
                    <Text style={styles.chartSub}>Median asking price</Text>
                    <MiniLineChart key={`p_${city}`} data={priceData} formatValue={formatInr} animate={false} />
                  </View>
                ) : null}
                {stageData.some((s) => s.value > 0) ? (
                  <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>Listings by Stage</Text>
                    <Text style={styles.chartSub}>Active listings</Text>
                    {/* No `play` prop = static bars. */}
                    <MiniBarChart key={`s_${city}`} data={stageData} formatValue={(v) => v.toLocaleString("en-IN")} unit="" />
                  </View>
                ) : null}
              </View>
              <Text style={styles.chartNote}>
                Based on {insights.listings.toLocaleString("en-IN")} active listings{city ? ` in ${city}` : ""}. Tap a point or bar for its value.
              </Text>
            </Fade>
          ) : null}
        </>
      )}

      <LoanCalculatorSheet visible={!!loanSheet} initialTab={loanSheet || "emi"} onClose={() => setLoanSheet(null)} />

      <BottomSheet visible={recentOpen} onClose={() => setRecentOpen(false)} title="Recent Searches">
        {searchHistory.length ? (
          <>
            {searchHistory.slice(0, 10).map((item) => (
              <PressableScale
                key={item.id}
                onPress={() => {
                  setRecentOpen(false);
                  rerunSearch(item);
                }}
                style={styles.recentRow}
                accessibilityRole="button"
              >
                <Ionicons name="time-outline" size={18} color={brand.violet} />
                <Text style={styles.recentText} numberOfLines={1}>
                  {item.label || item.query}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={brand.inkSoft} />
              </PressableScale>
            ))}
            <PressableScale onPress={clearSearchHistory} style={styles.clearBtn} accessibilityRole="button">
              <Text style={styles.clearText}>Clear search history</Text>
            </PressableScale>
          </>
        ) : (
          <Text style={styles.emptyRecent}>Your searches will appear here.</Text>
        )}
      </BottomSheet>

      <BottomSheet visible={comparedOpen} onClose={() => setComparedOpen(false)} title="Recently Compared">
        {compareHistory.length ? (
          <>
            {/* Plain rows, capped so the sheet always fits without a nested scroller. */}
            {compareHistory.slice(0, 5).map((item) => {
              const names = item.properties.map(cardName).join("  vs  ");
              return (
                <PressableScale
                  key={item.id}
                  onPress={() => reopenComparison(item)}
                  style={[styles.recentRow, styles.comparedRow]}
                  accessibilityRole="button"
                  accessibilityLabel={`Compare again: ${names}`}
                >
                  <Ionicons name="swap-horizontal" size={18} color={brand.violet} />
                  <View style={styles.comparedBody}>
                    <Text style={styles.comparedText} numberOfLines={2}>
                      {names}
                    </Text>
                    <Text style={styles.recentMeta}>{`${item.ids.length} properties`}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={brand.inkSoft} />
                </PressableScale>
              );
            })}
            <PressableScale onPress={clearCompareHistory} style={styles.clearBtn} accessibilityRole="button">
              <Text style={styles.clearText}>Clear compare history</Text>
            </PressableScale>
          </>
        ) : (
          <Text style={styles.emptyRecent}>Properties you compare will appear here.</Text>
        )}
      </BottomSheet>
    </Screen>
  );
}

const cardShadow = {
  shadowColor: brand.deep,
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 5 },
  elevation: 3,
};

const styles = StyleSheet.create({
  activityRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: 18 },
  activityCell: { flex: 1 },
  activityTile: {
    minHeight: 76,
    padding: 11,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "#EEF2F8",
    ...cardShadow,
  },
  activityTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  activityIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#EAF0FF", alignItems: "center", justifyContent: "center" },
  // Right side of the row, kept clear of the tile's edge; the row centres it on the icon.
  activityCount: { marginRight: 6, fontSize: 19, lineHeight: 24, fontWeight: "800", color: brand.ink, textAlignVertical: "center", includeFontPadding: false },
  activityLabel: { fontSize: 12.5, fontWeight: "600", color: brand.inkSoft, marginTop: 9 },
  resumeWrap: { marginHorizontal: 20, marginTop: 12 },
  resume: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
    paddingLeft: 16,
    paddingRight: 9,
    borderRadius: 16,
    overflow: "hidden", // clips the left border bar to the card's rounded corners
    backgroundColor: "#EEF3FF",
    borderWidth: 1,
    borderColor: "rgba(36, 87, 255, 0.12)",
  },
  resumeBody: { flex: 1, minWidth: 0 },
  resumeKicker: { fontSize: 11.5, fontWeight: "600", color: brand.inkSoft },
  resumeLine: { marginTop: 2 },
  resumeTitle: { fontSize: 14.5, fontWeight: "800", color: brand.ink },
  resumeTags: { fontSize: 12.5, fontWeight: "600", color: brand.violet },
  resumeBorder: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: brand.violet },
  // Same as the hero search bar's button: 40pt rounded square, blue gradient, white icon.
  resumeGo: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  section: { marginTop: 26 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 21, fontWeight: "700", color: brand.ink, letterSpacing: -0.3 },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
  viewAllText: { fontSize: 13, fontWeight: "800", color: brand.violet },
  rail: { paddingHorizontal: 20, gap: 12, paddingBottom: 6 },
  fCard: { backgroundColor: "#FFFFFF", borderRadius: 26, padding: 8, borderWidth: 1, borderColor: "#F0F4F5", ...cardShadow },
  // Inset photo with its own rounded corners (the card's padding shows around it).
  fImageWrap: { borderRadius: 20, overflow: "hidden", backgroundColor: brand.lavender },
  fHeart: { position: "absolute", top: 8, right: 8 },
  fBody: { paddingHorizontal: 6, paddingTop: 12, paddingBottom: 4 },
  fNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  fTitle: { flexShrink: 1, fontSize: 15.5, fontWeight: "800", color: brand.ink },
  fDesc: { marginTop: 4, minHeight: 36, gap: 2 },
  fPrice: { fontSize: 13.5, lineHeight: 18, fontWeight: "800", color: brand.ink },
  fPriceLabel: { fontSize: 11.5, fontWeight: "600", color: brand.inkSoft },
  fPlace: { fontSize: 12.5, lineHeight: 18, color: brand.inkSoft },
  fFoot: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, minHeight: 18 },
  fActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  // The border is permanent (violet blends into the gradient); never toggle it - see FeaturedCard.
  fCompare: { flex: 1, height: 38, borderRadius: radius.pill, overflow: "hidden", borderWidth: 1.2, borderColor: brand.violet },
  fCompareFill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  fCompareText: { fontSize: 12.5, fontWeight: "800", color: colors.white },
  rera: {
    position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 5,
    paddingLeft: 4, paddingRight: 9, height: 26, borderRadius: radius.pill, overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.55)",
    shadowColor: "#0E9F6E", shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  reraTick: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  reraText: { fontSize: 11, fontWeight: "900", color: colors.white, letterSpacing: 1 },
  fStat: { flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 1 },
  fStatText: { fontSize: 11.5, fontWeight: "600", color: brand.inkSoft },
  fPill: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: brand.lavender },
  loan: { marginHorizontal: 20, marginTop: 24, borderRadius: radius.xl, overflow: "hidden", flexDirection: "row", padding: 16, minHeight: 150, borderWidth: 1, borderColor: "#E7EFF2" },
  loanImage: { position: "absolute", right: 0, top: 0, bottom: 0, width: "58%", opacity: 0.9 },
  loanText: { flex: 1.25, justifyContent: "center", paddingRight: 8 },
  loanTitle: { fontFamily: fonts.serif, fontSize: 21, lineHeight: 26, fontWeight: "700", color: brand.ink },
  loanSub: { fontSize: 12, lineHeight: 17, color: brand.inkSoft, marginTop: 6 },
  loanSide: { flex: 1, justifyContent: "space-between", alignItems: "flex-end" },
  loanChip: { paddingHorizontal: 10, paddingVertical: 6 },
  loanChipSmall: { fontSize: 10.5, color: brand.inkSoft, fontWeight: "600" },
  loanChipBig: { fontSize: 13, color: brand.violet, fontWeight: "800" },
  loanBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: brand.goldBright, paddingHorizontal: 12, height: 36, borderRadius: radius.pill },
  loanBtnText: { fontSize: 12.5, fontWeight: "800", color: brand.ink },
  uCard: { width: 236, flexDirection: "row", gap: 10, padding: 8, backgroundColor: "#FFFFFF", borderRadius: radius.lg, borderWidth: 1, borderColor: "#EFF3F4", ...cardShadow },
  uImage: { width: 72, height: 84, borderRadius: 12 },
  uBody: { flex: 1, justifyContent: "center" },
  uBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginBottom: 4 },
  uBadgeText: { fontSize: 10, fontWeight: "800" },
  uTitle: { fontSize: 13.5, fontWeight: "800", color: brand.ink },
  uMeta: { fontSize: 11.5, color: brand.inkSoft, marginTop: 1 },
  emiCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 20,
    marginTop: 22,
    padding: 14,
    borderRadius: radius.lg,
    ...surfaces.glassStrong,
    ...cardShadow,
  },
  emiIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  emiTitle: { fontSize: 15, fontWeight: "800", color: brand.ink },
  emiSub: { fontSize: 11.5, lineHeight: 16, color: brand.inkSoft, marginTop: 2 },
  emiBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.4, borderColor: brand.violet, paddingHorizontal: 11, height: 36, borderRadius: radius.pill },
  emiBtnText: { fontSize: 12, fontWeight: "800", color: brand.violet },
  marketCity: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E7EFF2", paddingHorizontal: 10, height: 32, borderRadius: radius.pill },
  marketCityText: { fontSize: 12.5, fontWeight: "700", color: brand.ink },
  // Charts stacked one under the other, each full width.
  chartsRow: { gap: 14, paddingHorizontal: 20 },
  chartCard: { backgroundColor: "#FFFFFF", borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: "#EFF3F4", ...cardShadow },
  chartTitle: { fontSize: 15, fontWeight: "800", color: brand.ink },
  chartSub: { fontSize: 12, color: brand.inkSoft, marginBottom: 10 },
  chartNote: { fontSize: 11.5, color: brand.inkSoft, paddingHorizontal: 20, marginTop: 10 },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 50, borderBottomWidth: 1, borderBottomColor: "#F1F5F6" },
  recentText: { flex: 1, fontSize: 14.5, color: brand.ink, fontWeight: "600" },
  comparedRow: { paddingVertical: 12 },
  comparedBody: { flex: 1, minWidth: 0 },
  comparedText: { fontSize: 14.5, lineHeight: 20, color: brand.ink, fontWeight: "600" },
  recentMeta: { fontSize: 12, color: brand.inkSoft, marginTop: 2 },
  clearBtn: { alignSelf: "center", marginTop: 16, padding: 10 },
  clearText: { color: colors.error, fontWeight: "700", fontSize: 13.5 },
  emptyRecent: { color: brand.inkSoft, fontSize: 14, textAlign: "center", paddingVertical: 24 },
});
