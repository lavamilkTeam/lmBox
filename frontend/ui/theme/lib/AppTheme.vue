<script setup lang="ts">
import { Toaster, TooltipProvider } from '../../shadcn'
import 'vue-sonner/style.css'
import './base.css'
</script>
<template>
  <TooltipProvider :delay-duration="250">
    <slot />
    <Toaster
      position="top-center"
      :duration="3500"
      :close-button="true"
      container-aria-label="通知"
      :toast-options="{ classes: { toast: 'toast-message' }, closeButtonAriaLabel: '关闭提示' }"
    />
  </TooltipProvider>
</template>
