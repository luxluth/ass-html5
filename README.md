<div align="center">

# ass-html5

Display ASS/SSA subtitles on html5 videos

![CI workflow](https://github.com/luxluth/ass-html5/actions/workflows/main.yml/badge.svg)
![Publish workflow](https://github.com/luxluth/ass-html5/actions/workflows/publish.yml/badge.svg)
![License](https://img.shields.io/github/license/luxluth/ass-html5?color=blue)
![npm bundle size](https://img.shields.io/bundlephobia/min/ass-html5)
![npm](https://img.shields.io/npm/v/ass-html5?logo=npm&color=white&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2Fass-html5)

**🏗 PROJECT UNDER DEVELOPEMENT 🏗**

</div>

## Table of Contents

- [ass-html5](#ass-html5)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Example](#example)
    - [svelte and plry](#svelte-and-plry)

## Installation

```bash
pnpm add ass-html5
```

## Example

### [svelte](https://svelte.dev/) and [plry](https://github.com/sampotts/plyr)

```svelte
<script lang="ts">
    import video from '$lib/assets/video.mp4'
    import cc from '$lib/assets/cc.ass?raw'
    import ASS from 'ass-html5'
    import { onMount } from 'svelte';
    import Plyr from 'plyr'

    const ass = new ASS({
        assText: cc,
        video: "#video-test"
    })

    const controls = [
        'rewind',
        'play',
        'fast-forward',
        'progress',
        'current-time',
        'duration',
        'mute',
        'volume',
        'settings',
        'airplay',
        'fullscreen',
    ]

    let vidElement: HTMLVideoElement

    onMount(() => {
        const player = new Plyr(vidElement, {
            controls
        })

        ass.init()

    })

</script>

<div class="video-container">
    <!-- svelte-ignore a11y-media-has-caption -->
    <video
        preload="metadata"
        src="{video}"
        id="video-test"
        controls
        autoplay
        class="vid"
        bind:this={vidElement}
    ></video>
</div>
```
