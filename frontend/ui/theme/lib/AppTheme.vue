<script setup lang="ts">
import { NConfigProvider, NDialogProvider, NMessageProvider, type GlobalThemeOverrides } from 'naive-ui'
import './base.css'
const overrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#262626', primaryColorHover: '#525252', primaryColorPressed: '#171717', primaryColorSuppl: '#404040',
    infoColor: '#525252', successColor: '#525252', warningColor: '#525252', errorColor: '#262626',
    textColorBase: '#171717', textColor1: '#262626', textColor2: '#525252', textColor3: '#737373',
    borderColor: '#d4d4d4', dividerColor: '#e5e5e5', hoverColor: '#f5f5f5',
    borderRadius: '4px', fontSize: '12px', heightSmall: '30px',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
  },
  Input: { color: '#fafafa', colorFocus: '#fff', border: '1px solid #d4d4d4', boxShadowFocus: '0 0 0 2px #26262618' },
  InputNumber: { peers: { Input: { color: '#fafafa' } } },
}
</script>
<template>
  <NConfigProvider :theme-overrides="overrides"><NDialogProvider><NMessageProvider>
    <slot />
  </NMessageProvider></NDialogProvider></NConfigProvider>
</template>
