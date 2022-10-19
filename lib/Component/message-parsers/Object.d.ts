import * as React from 'react'
import { Theme } from '../../definitions/Component'
import type { Opts } from 'linkifyjs'
import { Message } from '../../definitions/Component'
interface Props {
  log: Message
  quoted: boolean
  theme?: Theme
  linkifyOptions?: Opts
}
declare const _default: React.FC<
  Pick<Props, 'log' | 'quoted' | 'linkifyOptions'> & {
    theme?: import('@emotion/react').Theme
  }
>
export default _default
