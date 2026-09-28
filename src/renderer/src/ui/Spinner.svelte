<!-- A small turning ring for work that runs in the background. -->
<span class="spinner" aria-hidden="true"></span>

<style>
  .spinner {
    display: inline-block;
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid var(--ring);
    border-top-color: currentColor;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }
  /* no turning; a slow fade still shows it is busy */
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      border-color: currentColor;
      animation: pulse 2.4s ease-in-out infinite alternate;
    }
  }
  @keyframes pulse {
    from {
      opacity: 0.25;
    }
  }
</style>
