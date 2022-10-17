import * as React from 'react'
import { Context } from '../../definitions/Component'
interface Props {
  theme?: Context
  data: any
}
declare const _default: React.FC<
  Pick<Props, 'data'> & {
    theme?: import('@emotion/react').Theme
  }
>
export default _default
