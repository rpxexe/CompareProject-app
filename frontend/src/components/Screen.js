import React, { useContext } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { colors } from "../theme";

// Standard screen frame: safe-area aware, optional scrolling, keyboard avoiding with clean sleek background.
export default function Screen({
  children,
  scroll = true,
  dark = false,
  padTop = true,
  padBottom = true,
  contentStyle,
  refreshControl,
  style,
  keyboard = false,
  scrollRef,
  onScroll,
}) {
  const insets = useSafeAreaInsets();
  // Inside the tabs the floating bottom bar overlaps the screen (its height includes the bottom inset).
  const bottom = Math.max(insets.bottom, useContext(BottomTabBarHeightContext) || 0);

  const body = scroll ? (
    <ScrollView
      nestedScrollEnabled={true}
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={[
        {
          paddingTop: padTop ? insets.top + 8 : 0,
          paddingBottom: padBottom ? bottom + 24 : 0,
          // Keep content a comfortable width on tablets / landscape / web.
          width: "100%",
          maxWidth: 760,
          alignSelf: "center",
        },
        contentStyle,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      onScroll={onScroll}
      // Scroll callbacks run in JavaScript, at most every 32 ms. (A Reanimated scroll handler was
      // tried here and made scrolling janky on a budget phone - see HomeScreen.)
      scrollEventThrottle={onScroll ? 32 : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={[
        {
          flex: 1,
          paddingTop: padTop ? insets.top + 8 : 0,
          paddingBottom: padBottom ? bottom : 0,
        },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <View style={[styles.root, dark && { backgroundColor: colors.ink }, style]}>
      <StatusBar style={dark ? "light" : "dark"} />

      {/* Dark screens get a gradient backdrop. Light screens are the plain ivory of styles.root:
          they used a near-invisible full-screen gradient (#FDFEFE -> #FAFCFC) that was redrawn on
          every scrolled frame. On a budget phone (Realme RMX3710), A/B on Home: with it, 38-42 ms
          per frame and 71-89% janky frames; without it, 25 ms and 13-15%. Keep full-screen
          backgrounds solid. */}
      {dark ? (
        <LinearGradient
          colors={[colors.deepViolet, colors.plum, "#0B1638", colors.ink]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}

      {keyboard ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ivory, overflow: "hidden" },
});

