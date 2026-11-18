<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  detectWalletLanguage,
  languagePreference,
  setLanguagePreference,
  type LanguagePreference,
} from '../localization.js';

const selected = ref<LanguagePreference>(languagePreference.value);
const detected = computed(() => detectWalletLanguage() === 'zh-CN' ? '简体中文' : 'English');

function applyLanguage() {
  setLanguagePreference(selected.value);
  window.location.reload();
}
</script>

<template>
  <div class="settings-view language-settings">
    <p class="hint">Use your browser language automatically, or choose a language for this wallet.</p>
    <label>
      Language
      <select v-model="selected">
        <option value="system">System ({{ detected }})</option>
        <option value="en">English</option>
        <option value="zh-CN">简体中文</option>
      </select>
    </label>
    <p class="hint">The system option reads the primary language from your browser or device.</p>
    <button type="button" :disabled="selected === languagePreference" @click="applyLanguage">
      Apply language
    </button>
  </div>
</template>

<style scoped>
.language-settings { display: flex; flex-direction: column; gap: 14px; }
select {
  appearance: auto;
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font: inherit;
  padding: 10px 12px;
  width: 100%;
}
select:focus { border-color: var(--color-accent); outline: none; }
</style>
