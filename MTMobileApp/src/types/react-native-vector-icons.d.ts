declare module "react-native-vector-icons/Ionicons" {
  import type { ComponentType } from "react"
  import type { TextProps } from "react-native"

  const Ionicons: ComponentType<
    TextProps & {
      name: string
      size?: number
      color?: string
    }
  >
  export default Ionicons
}

/** The first-run guide's tapping finger (`gesture-tap`); every font of the package ships in the APK. */
declare module "react-native-vector-icons/MaterialCommunityIcons" {
  import type { ComponentType } from "react"
  import type { TextProps } from "react-native"

  const MaterialCommunityIcons: ComponentType<
    TextProps & {
      name: string
      size?: number
      color?: string
    }
  >
  export default MaterialCommunityIcons
}
