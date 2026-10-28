<script setup lang="ts">
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '../../shadcn'
import githubLogo from './assets/github.svg'
import wechatLogo from './assets/wechat.svg'
import qqLogo from './assets/qq.svg'

const props = defineProps<{ action: 'login' | 'bind' }>()
const emit = defineEmits<{ select: [provider: 'wechat' | 'qq' | 'github'] }>()
const providers = [
  { id: 'wechat', label: '微信', logo: wechatLogo },
  { id: 'qq', label: 'QQ', logo: qqLogo },
  { id: 'github', label: 'GitHub', logo: githubLogo },
] as const
function label(provider: typeof providers[number]) {
  return props.action === 'bind' ? `绑定 ${provider.label}` : `${provider.label} 登录`
}
</script>

<template>
  <div class="account-dialog-providers" :class="{ 'is-login': action === 'login' }" role="group" :aria-label="action === 'bind' ? '绑定账号（可选）' : '第三方登录'">
    <p v-if="action === 'bind'" class="account-dialog-providers-label">绑定账号（可选）</p>
    <div class="account-dialog-provider-buttons">
      <Tooltip v-for="provider in providers" :key="provider.id">
        <TooltipTrigger as-child>
          <Button type="button" variant="outline" class="account-dialog-provider" :aria-label="label(provider)" @click="emit('select', provider.id)">
            <img :src="provider.logo" alt="" aria-hidden="true" width="22" height="22" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ label(provider) }}</TooltipContent>
      </Tooltip>
    </div>
  </div>
</template>

<style>
.account-dialog-providers { display:grid; gap:12px; }
.account-dialog-providers.is-login { padding-top:18px; border-top:1px solid var(--border); }
.account-dialog-providers-label { margin:0; font-size:13px; font-weight:500; }
.account-dialog-provider-buttons { display:flex; justify-content:center; gap:18px; }
.account-dialog-provider { flex:0 0 44px; width:44px; height:44px; padding:0; border-radius:50%; border-color:color-mix(in srgb,var(--foreground) 16%,var(--background)); }
.account-dialog-provider img { display:block; width:22px; height:22px; }
</style>
