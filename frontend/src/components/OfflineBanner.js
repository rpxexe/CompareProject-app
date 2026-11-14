import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNetwork } from "../context/NetworkContext";
import { isReducedMotion } from "../hooks/useReducedMotion";
import Text from "./AppText";
import { brand, colors } from "../theme";

const SHOW_MS = 2200;
// Matches OfflineScreen's grace period: a blip too short to show the offline page gets no toast.
const MIN_OFFLINE_MS = 900;

// "Back online" toast: slides down from the top when the connection returns after the offline
// page was shown, then slides away. (Being offline itself is shown by OfflineScreen.)
export default function OfflineBanner() {
  const { offline } = useNetwork();
  const { top } = useSafeAreaInsets();
  const [shown, setShown] = useState(false);
  const since = useRef(0);
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (offline) {
      since.current = since.current || Date.now();
      setShown(false);
      return undefined;
    }
    const wasLong = since.current && Date.now() - since.current >= MIN_OFFLINE_MS;
    since.current = 0;
    if (!wasLong) return undefined;
    setShown(true);
    AccessibilityInfo.announceForAccessibility?.("Back online");
    const id = setTimeout(() => setShown(false), SHOW_MS);
    return () => clearTimeout(id);
  }, [offline]);

  useEffect(() => {
    if (isReducedMotion()) {
      y.setValue(shown ? 1 : 0);
      return;
    }
    if (shown) Animated.spring(y, { toValue: 1, stiffness: 200, damping: 16, mass: 0.9, useNativeDriver: true }).start();
    else Animated.timing(y, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        { top: top + 6 },
        { opacity: y, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [-(top + 80), 0] }) }] },
      ]}
    >
      <View style={styles.bar} accessibilityLiveRegion="polite" accessibilityLabel="Back online">
        <View style={styles.icon}>
          <Ionicons name="wifi" size={16} color={brand.violet} />
        </View>
        <Text style={styles.title}>Back online</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 300, elevation: 30 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 46,
    paddingLeft: 6,
    paddingRight: 18,
    borderRadius: 23,
    backgroundColor: brand.violet,
    shadowColor: "#0A122E",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14, fontWeight: "800", color: colors.white },
});
