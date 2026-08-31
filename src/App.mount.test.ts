import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'

describe('App mount', () => {
  it('renders shell without crashing', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('Social Archiver')
    expect(wrapper.text()).toContain('缓存')
  })
})
