<script lang="ts">
  import TitleBar from './components/TitleBar.svelte'
</script>

<div class="app">
  <TitleBar title="Spindle" />
  <!-- Placeholder until ticket 004 ports the Studio template. -->
  <main class="winbody">
    <h1>Spindle</h1>
  </main>
</div>

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .winbody {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    background:
      radial-gradient(
        120% 90% at 20% 0%,
        color-mix(in oklch, var(--c2) 45%, transparent),
        transparent 60%
      ),
      linear-gradient(
        160deg,
        color-mix(in oklch, var(--c1) 55%, var(--mix-toward)),
        color-mix(in oklch, var(--c3) 30%, var(--bg))
      );
  }
  h1 {
    font-family: var(--display);
    font-weight: 700;
    font-size: 44px;
    letter-spacing: -0.02em;
    margin: 0;
    opacity: 0.85;
  }
</style>
