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
