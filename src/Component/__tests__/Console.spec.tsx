import React from 'react'
import { shallow } from 'enzyme'

React.useLayoutEffect = React.useEffect

import Console from '..'
import ConsoleMessage from '../Message'

it('renders', () => {
  const result = shallow(
    <Console
      logs={[
        {
          method: 'log',
          id: 'id',
          data: ['my-log'],
        },
      ]}
    />
  )

  expect(result.html()).toContain('my-log')
})

it('formats messages', () => {
  const result = shallow(
    <Console
      logs={[
        {
          method: 'log',
          id: 'id',
          data: ['%ctest', 'color: red', 'foo', [2]],
        },
      ]}
    />
  )

  const html = result.html()
  expect(html).toContain('<span style="color: red;">test</span>')
  expect(html).toContain('foo')
  expect(html).toContain('[<span style="color:rgb(28, 0, 207)">2</span>]')
})

it('skips non-existent substitution', () => {
  const result = shallow(
    <Console
      logs={[
        {
          method: 'log',
          id: 'id',
          data: ['%u', 'foo'],
        },
      ]}
    />
  )

  const html = result.html()
  expect(html).toContain('%u')
  expect(html).toContain('foo')
})

it('displays object names', () => {
  const result = shallow(
    <Console
      logs={[
        {
          method: 'log',
          id: 'id',
          data: [new (class MyObject {})()],
        },
      ]}
    />
  )

  expect(result.html()).toContain(
    '<span style="font-style:italic">MyObject </span><span style="font-style:italic">{}</span>'
  )
})

it('linkify object', () => {
  const result = shallow(
    <Console
      logs={[
        {
          method: 'log',
          id: 'id',
          data: ['hello https://example.com'],
        },
      ]}
    />
  )

  expect(result.html()).toContain(
    '<a href="https://example.com" class="linkified" target="_blank">https://example.com</a>'
  )
})

it('linkify object and pass options', () => {
  const result = shallow(
    <Console
      logs={[
        {
          method: 'log',
          id: 'id',
          data: ['hello https://example.com'],
        },
      ]}
      linkifyOptions={{
        attributes: (href, type) => (type === 'url' ? { rel: 'nofollow' } : {}),
      }}
    />
  )

  expect(result.html()).toContain(
    '<a href="https://example.com" class="linkified" target="_blank" rel="nofollow">https://example.com</a>'
  )
})

it('allows all types methods', () => {
  const methods = [
    'log',
    'debug',
    'info',
    'warn',
    'error',
    'table',
    'clear',
    'time',
    'timeEnd',
    'count',
    'assert',
    'result',
    'command',
  ] as const
  const result = shallow(
    <Console logs={methods.map((method) => ({ method, id: 'id', data: [] }))} />
  )
  expect(result.find(ConsoleMessage).length).toBe(methods.length)
  methods.forEach((method) => {
    expect(result.html()).toContain(`data-method="${method}"`)
  })
})
