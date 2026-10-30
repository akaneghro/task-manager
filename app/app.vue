<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
const { locale } = useI18n()

// Apply the stored/system colour mode before first paint (avoids a light flash in dark mode).
const COLOR_MODE_SCRIPT = `(function(){try{var c=document.cookie.match(/(?:^|; )tm_color_mode=(dark|light)/);var m=c?c[1]:localStorage.getItem('task-manager-color-mode');if(m==='dark'||(m!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`

useHead({
  htmlAttrs: { lang: () => locale.value },
  script: [{ innerHTML: COLOR_MODE_SCRIPT, tagPosition: 'head' }],
})

const colorMode = useColorMode()

// nuxt.config.ts sets theme-color (installed app title bar) per system preference; an explicit light/dark choice
// overrides both so the title bar matches the top bar (white / gray-950).
useHead({
  meta: () => (colorMode.explicit
    ? [{ name: 'theme-color', content: colorMode.value === 'dark' ? '#030712' : '#ffffff' }]
    : []),
})
</script>
