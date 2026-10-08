<template>
  <div class="login-layout">
    <div class="login-layout-inner">
      <section class="hero login-hero">
        <div class="hero-badge">{{ copy.common.appName }}</div>
        <h1 class="hero-title">{{ copy.login.title }}</h1>
        <p class="hero-subtitle">{{ copy.login.subtitle }}</p>
      </section>

      <form class="card stack" @submit.prevent="onSubmit">
        <div class="section-title">{{ copy.login.formTitle }}</div>
        <p class="muted">{{ copy.login.formHint }}</p>

        <div v-if="notice" class="notice-line">{{ notice }}</div>

        <label class="field">
          <span class="field-label">{{ copy.login.studentIdLabel }}</span>
          <input
            v-model="studentId"
            class="field-input"
            type="text"
            name="studentId"
            autocomplete="username"
            :placeholder="copy.login.studentIdPlaceholder"
            :disabled="submitting"
          />
        </label>

        <label class="field">
          <span class="field-label">{{ copy.login.passphraseLabel }}</span>
          <input
            v-model="passphrase"
            class="field-input"
            type="password"
            name="passphrase"
            autocomplete="current-password"
            :placeholder="copy.login.passphrasePlaceholder"
            :disabled="submitting"
          />
        </label>

        <p v-if="failureText" class="field-error">{{ failureText }}</p>

        <button type="submit" class="btn btn-primary" :disabled="submitting">
          <span v-if="submitting" class="spinner" aria-hidden="true"></span>
          <span>{{ submitting ? copy.login.submitting : copy.login.submit }}</span>
        </button>

      </form>

      <footer class="page-footer">
        <span>{{ copy.common.appName }}</span>
        <span>{{ copy.common.webVersionLabel }} {{ WEB_CLIENT_VERSION }}</span>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import copy from '@/locales/zh-CN/index.js';
import { callApi } from '@/runtime/api.js';
import { applyLoginResult, session } from '@/runtime/session.js';
import { WEB_CLIENT_VERSION } from '@/runtime/version.js';

const route = useRoute();
const router = useRouter();

const studentId = ref('');
const passphrase = ref('');
const submitting = ref(false);
const failureText = ref('');

const notice = computed(() => {
  if (route.query.reason === 'expired') return copy.login.expiredNotice;
  return session.status === 'anonymous' ? session.notice : '';
});

function failureReason(error) {
  const status = String((error && error.status) || '');
  if (status === 'account_frozen') return copy.login.frozen;
  if (status === 'login_failed' || status === 'auth_failed') return copy.login.failed;
  return (error && error.message) || copy.login.unavailable;
}

async function onSubmit() {
  if (submitting.value) return;
  if (!studentId.value.trim()) {
    failureText.value = copy.login.missingStudentId;
    return;
  }
  if (!passphrase.value) {
    failureText.value = copy.login.missingPassphrase;
    return;
  }
  submitting.value = true;
  failureText.value = '';
  try {
    const result = await callApi('auth/password/session', {
      studentId: studentId.value.trim(),
      passphrase: passphrase.value,
      // 网页模式：服务端把登录凭证写进 HttpOnly Cookie，响应体里没有明文令牌。
      webSession: true
    }, { skipAuthRedirect: true });
    if (result && result.status === 'login_success') {
      passphrase.value = '';
      applyLoginResult(result);
      router.replace({ name: 'portal' });
      return;
    }
    failureText.value = (result && result.message) || copy.login.unavailable;
  } catch (error) {
    failureText.value = failureReason(error);
  } finally {
    submitting.value = false;
  }
}
</script>
