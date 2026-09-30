<!-- Little bars that bounce while a song plays (the app root has .song-playing; not for radio).
     paused: a pause sign instead, since still bars read as "..." next to a title. -->
<script lang="ts">
  let { paused = false }: { paused?: boolean } = $props()
</script>

<span class="eq" class:paused aria-hidden="true"><i></i><i></i><i></i></span>

<style>
  .eq {
    display: inline-flex;
    gap: 2px;
    align-items: flex-end;
    height: 12px;
    flex: none;
  }
  i {
    width: 3px;
    background: currentColor;
    border-radius: 1px;
    height: 40%;
  }
  :global(.song-playing) i {
    animation: eq 0.9s ease-in-out infinite alternate;
  }
  i:nth-child(2) {
    animation-delay: -0.3s !important;
    height: 80%;
  }
  i:nth-child(3) {
    animation-delay: -0.6s !important;
    height: 60%;
  }
  .paused {
    gap: 3px;
    align-items: center;
  }
  /* after the rules above, so it wins over their heights */
  .paused i {
    height: 80%;
    animation: none;
  }
  .paused i:nth-child(2) {
    display: none;
  }
  @keyframes eq {
    from {
      height: 20%;
    }
    to {
      height: 100%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    i {
      animation: none !important;
    }
  }
</style>
