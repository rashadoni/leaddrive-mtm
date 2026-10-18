import React from "react"
import { Pressable, type PressableProps } from "react-native"
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs"
import GuideSpot from "./GuideSpot"

/**
 * The tab bar's button with a GuideSpot inside, so the guide can light
 * «Marşrut» itself and count a real press on it.
 *
 * On Android the navigator's own button is a Pressable with a ripple and no
 * fade (PlatformPressable, @react-navigation/elements 2.9): this one draws the
 * same, and passes on everything the tab bar hands it — its role, selected
 * state, label and style.
 */
export default function GuideTabButton({ spot, ...props }: BottomTabBarButtonProps & { spot: string }) {
  const {
    children,
    style,
    onPress,
    android_ripple,
    href: _href,
    pressColor: _pressColor,
    pressOpacity: _pressOpacity,
    hoverEffect: _hoverEffect,
    ref: _ref,
    ...rest
  } = props as BottomTabBarButtonProps & { ref?: unknown }
  return (
    <Pressable
      {...(rest as PressableProps)}
      onPress={onPress as PressableProps["onPress"]}
      android_ripple={{ color: "rgba(0, 0, 0, .32)", ...(android_ripple ?? {}) }}
      style={style}
    >
      {children}
      <GuideSpot id={spot} />
    </Pressable>
  )
}
