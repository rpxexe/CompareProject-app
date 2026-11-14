import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import PressableScale from "./PressableScale";
import { brand, colors, gradients, radius } from "../theme";
import Text from "./AppText";

export default function Button({
  title,
  onPress,
  variant = "gold",
  loading,
  disabled,
  icon,
  iconRight,
  style,
  small,
  compact, // shorter than `small`, for tight footers (filter screen's Clear / Apply row)
  accessibilityLabel,
  accessibilityHint,
}) {
  const off = disabled || loading;
  const inner = (color) => (
    <View style={styles.row}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={compact ? 16 : 18}
              color={color}
              style={{ marginRight: compact ? 6 : 8 }}
            />
          ) : null}
          <Text style={[styles.text, { color }, small && { fontSize: 14 }, compact && { fontSize: 13.5 }]}>
            {title}
          </Text>
          {iconRight ? (
            <Ionicons
              name={iconRight}
              size={18}
              color={color}
              style={{ marginLeft: 8 }}
            />
          ) : null}
        </>
      )}
    </View>
  );
  return (
    <PressableScale
      onPress={off ? undefined : onPress}
      disabled={off}
      style={[{ opacity: off && !loading ? 0.5 : 1 }, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy: !!loading }}
    >
      {variant === "gold" ? (
        <LinearGradient
          colors={gradients.cta}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.base, small && styles.small, compact && styles.compact, styles.ctaShadow]}
        >
          {inner(colors.white)}
        </LinearGradient>
      ) : variant === "glass" ? (
        <View style={[styles.base, small && styles.small, compact && styles.compact, styles.glassBtn]}>
          <LinearGradient
            colors={["rgba(255,255,255,0.95)", "rgba(252, 253, 254, 0.75)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
          />
          <LinearGradient
            colors={["rgba(255,255,255,0.7)", "rgba(255,255,255,0.05)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.6 }}
            style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
          />
          {inner(colors.ink)}
        </View>
      ) : variant === "glassDark" ? (
        <View style={[styles.base, small && styles.small, compact && styles.compact, styles.glassDarkBtn]}>
          <LinearGradient
            colors={["rgba(16, 35, 96, 0.85)", "rgba(10, 18, 46, 0.82)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
          />
          <LinearGradient
            colors={["rgba(125, 155, 255, 0.3)", "rgba(255, 255, 255, 0.02)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.6 }}
            style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
          />
          {inner(colors.ivory)}
        </View>
      ) : variant === "dark" ? (
        <View
          style={[
            styles.base,
            small && styles.small, compact && styles.compact,
            { backgroundColor: colors.ink },
          ]}
        >
          {inner(colors.ivory)}
        </View>
      ) : (
        <View
          style={[
            styles.base,
            small && styles.small, compact && styles.compact,
            {
              backgroundColor: "rgba(255, 255, 255, 0.65)",
              borderWidth: 1.5,
              borderColor: "rgba(226, 233, 235, 0.85)",
            },
          ]}
        >
          {inner(colors.ink)}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 54,
    borderRadius: radius.pill,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  small: { minHeight: 44, paddingHorizontal: 18 },
  compact: { minHeight: 38, paddingHorizontal: 16 },
  ctaShadow: {
    shadowColor: brand.violet,
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  glassBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    borderWidth: 1,
    borderColor: "#E7EFF2",
    shadowColor: brand.deep,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  glassDarkBtn: {
    backgroundColor: "rgba(10, 18, 46, 0.8)",
    borderWidth: 1.2,
    borderColor: "rgba(125, 155, 255, 0.45)",
    shadowColor: "#2457FF",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", zIndex: 1 },
  text: { fontSize: 15.5, fontWeight: "800", letterSpacing: 0.3 },
});
