import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { brand, colors, radius } from "../../theme";
import { isReducedMotion } from "../../hooks/useReducedMotion";
import Text from "../AppText";

const PAD = 3;
const BORDER = 1;
// Below this segment width the label drops a size, so "Commercial" fits when four tabs share a
// phone's width. Labels only (no icons) for now.
const COMPACT_SEG = 96;

// Equal-width segmented tabs (Buy / Rent / Projects / Commercial) on the filter screen's violet header.
// A white pill slides under the active tab.
export default function SearchTabs({ tabs, value, onChange }) {
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const index = Math.max(0, tabs.findIndex((t) => t.id === value));
  // onLayout's width includes the border, but the tabs and the absolutely placed pill sit inside it.
  const seg = width ? (width - BORDER * 2 - PAD * 2) / tabs.length : 0;
  const compact = seg > 0 && seg < COMPACT_SEG;

  useEffect(() => {
    if (!seg) return;
    const to = index * seg;
    if (!placed.current || isReducedMotion()) {
      placed.current = true;
      x.setValue(to);
      return;
    }
    Animated.spring(x, { toValue: to, useNativeDriver: true, friction: 9, tension: 90 }).start();
  }, [index, seg]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      {seg ? <Animated.View pointerEvents="none" style={[styles.thumb, { width: seg, transform: [{ translateX: x }] }]} /> : null}
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <Pressable
            key={t.id}
            onPress={() => onChange(t.id)}
            // Exactly one segment wide, so each tab lines up with the pill under it.
            style={[styles.tab, seg ? { width: seg, flex: 0 } : null]}
            // Compact bar to leave room for the filters; hitSlop keeps a full-size touch target.
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
          >
            <Text
              style={[styles.text, compact && styles.textCompact, on && styles.textOn]}
              numberOfLines={1}
              maxFontSizeMultiplier={compact ? 1.1 : 1.3}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    padding: PAD,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderWidth: BORDER,
    borderColor: "rgba(255, 255, 255, 0.28)",
  },
  thumb: {
    position: "absolute",
    top: PAD,
    bottom: PAD,
    left: PAD,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
  },
  tab: { flex: 1, minHeight: 32, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  // flexShrink lets the label fit (and auto-shrink) inside its segment instead of spilling out.
  text: { flexShrink: 1, fontSize: 13.5, fontWeight: "700", color: colors.white, textAlign: "center" },
  textCompact: { fontSize: 12.5 },
  textOn: { color: brand.violet, fontWeight: "800" },
});
