import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import PressableScale from "../PressableScale";
import Button from "../Button";
import Text from "../AppText";
import ListingCard from "./ListingCard";
import { api } from "../../services/api";
import { activeFilterIds, chipLabel, clear, setQuery, toQueryParams } from "../../utils/filterState";
import { brand, colors, radius } from "../../theme";

const PLACE_IDS = ["q:city", "q:locality"];
// Filters a sentence names directly; any others count as "your filters".
const DESCRIBED = ["propertyType", "q:propertyType", "q:search", ...PLACE_IDS];
const SECTIONS = 2; // suggested-listing sections
const PER_SECTION = 3;
const fmt = (n) => Number(n).toLocaleString("en-IN");

// What a search asks for, in plain words: 'Plot / Land listings matching "lodha" in Mumbai'.
// `anywhere` is said when no place is set (e.g. " in all cities"), or nothing.
export function describeSearch(state, config, anywhere = "") {
  const type = chipLabel(state, config, "propertyType") || state.query.propertyType || "";
  const what = type ? `${type} listings` : "properties";
  const search = state.query.search ? ` matching “${state.query.search}”` : "";
  const place = state.query.locality || state.query.city;
  return `${what}${search}${place ? ` in ${place}` : anywhere}`;
}
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Shown when a search finds nothing. Says what was searched in a sentence, then offers ways out:
// - one button per filter worth dropping, in words ("Show 1,258 properties in Mumbai"),
// - other cities that do have what was asked for ("available in: Visakhapatnam 72 ..."),
// - a few real listings for the two best alternatives (same place, or same search elsewhere).
// `suggestions`: [{ id, label, state, params, count }] - single-filter removals that find
// something, most results first (worked out by SearchScreen).
export default function NoResults({ state, config, suggestions, onApply, onClearAll, tagFor }) {
  const others = activeFilterIds(state, config).filter((id) => !DESCRIBED.includes(id));
  const anything = activeFilterIds(state, config).length > 0;
  const title = anything
    ? `No ${describeSearch(state, config)} ${others.length ? "match your filters" : "yet"}`
    : "No listings here yet";

  // Other cities with matches, when a place is set and something else narrows the search.
  const place = state.query.locality || state.query.city;
  const elsewhere = useMemo(
    () => (place ? PLACE_IDS.reduce((s, id) => clear(s, config, id), state) : null),
    [state, config, place],
  );
  const asksForSomething = elsewhere && activeFilterIds(elsewhere, config).length > 0;
  const [cities, setCities] = useState([]);
  const [elsewhereTotal, setElsewhereTotal] = useState(0);
  useEffect(() => {
    setCities([]);
    setElsewhereTotal(0);
    if (!asksForSomething) return undefined;
    let live = true;
    api
      .propertyCount({ ...toQueryParams(elsewhere, config), by: "city" })
      .then((r) => {
        if (!live) return;
        setCities((r?.cities || []).filter((c) => c.city.toLowerCase() !== String(state.query.city || "").toLowerCase()).slice(0, 6));
        setElsewhereTotal(r?.total || 0);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [elsewhere, asksForSomething]); // eslint-disable-line react-hooks/exhaustive-deps

  // A few listings for the best alternatives: same place without the filter that rules everything
  // out, and the same search in every city (the place is part of what was searched, so it is never
  // offered as a filter to remove; this section is how other places get suggested).
  const top = useMemo(() => {
    const list = suggestions.slice(0, SECTIONS);
    if (elsewhereTotal > 0) {
      list.push({ id: "elsewhere", label: place, state: elsewhere, params: toQueryParams(elsewhere, config), count: elsewhereTotal });
    }
    return list;
  }, [suggestions, elsewhereTotal, elsewhere, config, place]);
  const topKey = top.map((s) => `${s.id}:${s.count}`).join("|");
  const [samples, setSamples] = useState({});
  useEffect(() => {
    setSamples({});
    if (!top.length) return undefined;
    let live = true;
    top.forEach((s) =>
      api
        .properties({ ...s.params, limit: PER_SECTION })
        .then((r) => live && setSamples((prev) => ({ ...prev, [s.id]: r?.items || [] })))
        .catch(() => {}),
    );
    return () => {
      live = false;
    };
  }, [topKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.wrap}>
      <View style={styles.iconRing}>
        <Ionicons name="search-outline" size={28} color={brand.violet} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>

      {suggestions.length ? (
        <>
          <Text style={styles.hint}>Try one of these instead:</Text>
          <View style={styles.options}>
            {suggestions.map((s, i) => (
              <PressableScale
                key={s.id}
                onPress={() => onApply(s.state)}
                to={0.97}
                style={[styles.option, i === 0 && styles.optionMain]}
                accessibilityRole="button"
                accessibilityLabel={`Show ${s.count} ${describeSearch(s.state, config, " in all cities")}, without ${s.label}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionText, i === 0 && styles.optionTextMain]} numberOfLines={2}>
                    {`Show ${fmt(s.count)} ${describeSearch(s.state, config, " in all cities")}`}
                  </Text>
                  <Text style={[styles.optionSub, i === 0 && styles.optionSubMain]} numberOfLines={1}>
                    {`Removes “${s.label}”`}
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color={i === 0 ? colors.white : brand.violet} />
              </PressableScale>
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.hint}>Try a different search or fewer filters.</Text>
      )}

      {cities.length ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>{`${capitalise(describeSearch(elsewhere, config))} are available in:`}</Text>
          <View style={styles.cities}>
            {cities.map((c) => (
              <PressableScale
                key={c.city}
                onPress={() => onApply(setQuery(elsewhere, config, { city: c.city, locality: "" }))}
                to={0.95}
                style={styles.city}
                accessibilityRole="button"
                accessibilityLabel={`${c.city}, ${c.count} listings`}
              >
                <Ionicons name="location-outline" size={13} color={brand.violet} />
                <Text style={styles.cityName}>{c.city}</Text>
                <Text style={styles.cityCount}>{fmt(c.count)}</Text>
              </PressableScale>
            ))}
          </View>
        </View>
      ) : null}

      {top.map((s) =>
        samples[s.id]?.length ? (
          <View key={s.id} style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle} numberOfLines={2}>
                {capitalise(describeSearch(s.state, config, " in all cities"))}
              </Text>
              <PressableScale onPress={() => onApply(s.state)} hitSlop={8} style={styles.seeAll} accessibilityRole="button">
                <Text style={styles.seeAllText}>{`See all ${fmt(s.count)}`}</Text>
                <Ionicons name="chevron-forward" size={14} color={brand.violet} />
              </PressableScale>
            </View>
            <View style={styles.cards}>
              {samples[s.id].map((p, i) => (
                <ListingCard key={p.id} property={p} index={i} tag={tagFor(p)} />
              ))}
            </View>
          </View>
        ) : null,
      )}

      {anything ? (
        <Button title="Clear all filters" variant="ghost" small onPress={onClearAll} style={{ alignSelf: "center", marginTop: 18 }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 18, paddingBottom: 8 },
  iconRing: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#EEF3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { marginTop: 14, fontSize: 19, lineHeight: 25, fontWeight: "800", color: brand.ink, textAlign: "center", paddingHorizontal: 8 },
  hint: { marginTop: 8, fontSize: 13.5, color: brand.inkSoft, textAlign: "center" },
  options: { marginTop: 14, gap: 10 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1.2,
    borderColor: "#DCE5F7",
    backgroundColor: colors.white,
  },
  optionMain: { backgroundColor: brand.violet, borderColor: brand.violet },
  optionText: { fontSize: 14.5, fontWeight: "800", color: brand.ink },
  optionTextMain: { color: colors.white },
  optionSub: { marginTop: 2, fontSize: 11.5, fontWeight: "600", color: brand.inkSoft },
  optionSubMain: { color: "rgba(255,255,255,0.8)" },
  block: { marginTop: 22 },
  blockTitle: { fontSize: 14, fontWeight: "800", color: brand.ink },
  cities: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  city: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: "#EEF3FF",
  },
  cityName: { fontSize: 13, fontWeight: "700", color: brand.ink },
  cityCount: { fontSize: 12, fontWeight: "800", color: brand.violet },
  section: { marginTop: 26 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: "800", color: brand.ink },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { fontSize: 13, fontWeight: "800", color: brand.violet },
  cards: { gap: 12 },
});
