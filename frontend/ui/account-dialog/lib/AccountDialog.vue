<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, Input, Label, Tabs, TabsContent, TabsList, TabsTrigger } from '../../shadcn'
import ProviderButtons from './ProviderButtons.vue'

defineProps<{ error?: string }>()
const emit = defineEmits<{
  submit: [request: { mode: 'login' | 'register'; email: string; password: string; verificationCode?: string }]
  requestCode: [email: string]
  providerAction: [request: { provider: 'wechat' | 'qq' | 'github'; action: 'login' | 'bind' }]
  reset: []
}>()
const open = ref(false)
const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const confirmation = ref('')
const verificationCode = ref('')
const emailInput = ref<InstanceType<typeof Input>>()
const validation = ref('')
const id = useId()

function clearError() {
  validation.value = ''
  emit('reset')
}
watch([open, mode], () => {
  password.value = ''
  confirmation.value = ''
  verificationCode.value = ''
  if (!open.value) email.value = ''
  clearError()
})
function submit() {
  clearError()
  if (mode.value === 'register' && password.value !== confirmation.value) {
    validation.value = '两次输入的密码不一致。'
    return
  }
  emit('submit', { mode: mode.value, email: email.value.trim(), password: password.value,
    ...(mode.value === 'register' ? { verificationCode: verificationCode.value.trim() } : {}) })
}
function requestCode() {
  clearError()
  if (!emailInput.value?.input?.reportValidity()) return
  emit('requestCode', email.value.trim())
}
function providerAction(provider: 'wechat' | 'qq' | 'github') {
  clearError()
  emit('providerAction', { provider, action: mode.value === 'login' ? 'login' : 'bind' })
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <button type="button" class="account-avatar" aria-label="请登陆">请登陆</button>
    </DialogTrigger>
    <DialogContent class="account-dialog-content" :aria-describedby="undefined">
      <DialogHeader><DialogTitle>账户</DialogTitle></DialogHeader>
      <Tabs v-model="mode" class="account-dialog-tabs">
        <TabsList class="account-dialog-modes" aria-label="账户操作">
          <TabsTrigger value="login">登录</TabsTrigger>
          <TabsTrigger value="register">注册</TabsTrigger>
        </TabsList>
        <TabsContent :key="mode" :value="mode" class="account-dialog-panel">
          <form class="account-dialog-form" @submit.prevent="submit" @input="clearError">
            <div class="account-dialog-field">
              <Label :for="`${id}-email`">邮箱</Label>
              <Input :id="`${id}-email`" ref="emailInput" v-model="email" name="email" type="email" autocomplete="username" required />
            </div>
            <div class="account-dialog-field">
              <Label :for="`${id}-password`">密码</Label>
              <Input :id="`${id}-password`" v-model="password" name="password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" required />
            </div>
            <div v-if="mode === 'register'" class="account-dialog-field">
              <Label :for="`${id}-confirmation`">确认密码</Label>
              <Input :id="`${id}-confirmation`" v-model="confirmation" name="confirmation" type="password" autocomplete="new-password" required
                :aria-invalid="!!validation" :aria-describedby="validation ? `${id}-error` : undefined" />
            </div>
            <div v-if="mode === 'register'" class="account-dialog-field">
              <Label :for="`${id}-code`">邮箱验证码</Label>
              <div class="account-dialog-code">
                <Input :id="`${id}-code`" v-model="verificationCode" name="verification-code" autocomplete="one-time-code" required />
                <Button type="button" variant="outline" @click="requestCode">获取验证码</Button>
              </div>
            </div>
            <ProviderButtons v-if="mode === 'register'" action="bind" @select="providerAction" />
            <p v-if="validation || error" :id="`${id}-error`" class="account-dialog-error" role="alert">{{ validation || error }}</p>
            <Button type="submit" class="account-dialog-submit">{{ mode === 'login' ? '登录' : '注册' }}</Button>
          </form>
        </TabsContent>
      </Tabs>
      <ProviderButtons v-if="mode === 'login'" action="login" @select="providerAction" />
    </DialogContent>
  </Dialog>
</template>

<style>
.account-avatar { display:grid; place-items:center; width:36px; height:36px; padding:0; border:1px solid color-mix(in srgb,var(--foreground) 12%,transparent); border-radius:50%; background:color-mix(in srgb,var(--background) 72%,#ffdae0); color:var(--foreground); font-family:inherit; font-size:10px; line-height:1; white-space:nowrap; cursor:pointer; }
.account-avatar:hover { background:var(--background); }
.account-avatar:focus-visible { outline:2px solid var(--ring); outline-offset:2px; }
.account-dialog-content { width:calc(100vw - 32px); max-width:400px; max-height:calc(100dvh - 32px); overflow-y:auto; padding:24px; gap:24px; border-radius:20px; }
.account-dialog-tabs { gap:20px; min-width:0; }
.account-dialog-modes { width:100%; }
.account-dialog-modes>[role=tab] { flex:1; }
.account-dialog-panel { min-width:0; margin:0; }
.account-dialog-form { display:grid; gap:18px; }
.account-dialog-field { display:grid; gap:8px; min-width:0; }
.account-dialog-field input { box-sizing:border-box; }
.account-dialog-error { margin:0; color:var(--destructive); font-size:13px; line-height:1.5; overflow-wrap:anywhere; }
.account-dialog-submit { width:100%; }
.account-dialog-code { display:flex; gap:8px; min-width:0; }
.account-dialog-code input { flex:1; min-width:0; width:0; }
.account-dialog-code button { flex-shrink:0; }
</style>
