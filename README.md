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
  - [Usage](#usage)
    - [Simple HTML](#simple-html)
    - [Svelte and Plry](#svelte-and-plry)

## Installation

```bash
pnpm add ass-html5
```

## Usage

### Simple HTML

> Note that with the simple `video` tag element, on fullscreen mode, the position of the video is absoluty on top of any element.
> No other element can go on top of it.
> 
> It's therefore recommanded to use a third party player rather than the native one. You can see an example with [plry](https://github.com/sampotts/plyr) [here](#svelte-and-plry).


```html
<script src="https://cdn.jsdelivr.net/npm/ass-html5/dist/ass.min.js"></script>
```

```html
<video src="/assets/video.mp4" id="video" controls></video>
```

```html
<script>
    document.addEventListener('DOMContentLoaded', async () => {
        let res = await fetch('/assets/video.ass')
        let assSubs = await res.text()

        const ass = new ASS({
            assText: assSubs,
            video: document.getElementById("video") 
        })
        ass.init()
    })
</script>
```

### [Svelte](https://github.com/sveltejs/svelte) and [Plry](https://github.com/sampotts/plyr)

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
