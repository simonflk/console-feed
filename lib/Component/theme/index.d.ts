import '@emotion/react'
import { CreateStyled } from '@emotion/styled'
import { Context } from '../../definitions/Component'
declare module '@emotion/react' {
  interface Theme extends Context {}
}
declare const _default: CreateStyled
export default _default
