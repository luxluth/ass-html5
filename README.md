<div align="center">

# ass-html5

Display ASS/SSA subtitles on html5 videos

![CI workflow](https://github.com/luxluth/ass-html5/actions/workflows/main.yml/badge.svg)
![Publish workflow](https://github.com/luxluth/ass-html5/actions/workflows/publish.yml/badge.svg)
![License](https://img.shields.io/github/license/luxluth/ass-html5?color=blue)
![npm bundle size](https://img.shields.io/bundlephobia/min/ass-html5)
![npm](https://img.shields.io/npm/v/ass-html5?logo=npm&color=white&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2Fass-html5)

</div>

## Table of Contents

- [ass-html5](#ass-html5)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Usage](#usage)
    - [Options](#options)
    - [Simple HTML](#simple-html)
    - [Svelte and Plry](#svelte-and-plry)
    - [videojs](#videojs)
- [Credits](#credits)

## Installation

```bash
pnpm add ass-html5
```

## Usage

### Options

| option  |                                                 description                                                 | required |             type              |        default        |
| :-----: | :---------------------------------------------------------------------------------------------------------: | :------: | :---------------------------: | :-------------------: |
| assText |                                             The ass text string                                             |    ✅    |           `string`            |      `undefined`      |
|  video  | The video to display the subtile on. Can be either an `HTMLVideoElement` or `string` (html query selector ) |    ✅    | `HTMLVideoElement` / `string` |      `undefined`      |
|  fonts  |                                            Custom fonts to load                                             |    🚫    |  [`Font[]`](src/ass.ts#L54)   |      `undefined`      |
| zIndex  |                                        zIndex of the rendering frame                                        |    🚫    |           `number`            | Drawn after the video |

### Simple HTML

> [!NOTE]
> The simple `video` tag element, on fullscreen mode, the position of the video is absoluty on top of any element.
> No other element can go on top of it.
>
> It's therefore recommanded to use a third party player rather than the native one. You can see an example with [plry](https://github.com/sampotts/plyr) [here](#svelte-and-plry).

```html
<script src="https://cdn.jsdelivr.net/npm/ass-html5@<VERSION>/dist/ass.min.js"></script>
```

```html
<video src="/assets/video.mp4" id="video" controls></video>
```

```html
<script>
  document.addEventListener('DOMContentLoaded', async () => {
    let res = await fetch('/assets/video.ass');
    let assSubs = await res.text();

    const ass = new ASS({
      assText: assSubs,
      video: document.getElementById('video')
    });
    await ass.init();
  });
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

    let vidElement: HTMLVideoElement
    let player: Plyr
    onMount(async () => {
        player = new Plyr(vidElement)
        await ass.init()
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

### [videojs](https://github.com/videojs/video.js)

In the `head` :

```html
<script src="https://cdn.jsdelivr.net/npm/ass-html5@<VERSION>/dist/ass.min.js" defer></script>
<script src="https://vjs.zencdn.net/8.3.0/video.min.js" defer></script>
<link href="https://vjs.zencdn.net/8.3.0/video-js.css" rel="stylesheet" />
```

In the `body` :

```html
<video
  id="my-video"
  class="video-js"
  controls
  preload="auto"
  width="1280"
  height="720"
  data-setup="{}"
>
  <source src="assets/video.mp4" type="video/mp4" />
</video>
```

In the `script` tag :

```html
<script>
  document.addEventListener('DOMContentLoaded', async () => {
    let res = await fetch('/assets/video.ass');
    let assSubs = await res.text();

    var player = videojs('my-video');

    player.ready(async () => {
      // Get the video element from the player
      var videoElement = player.el().getElementsByTagName('video')[0];
      const ass = new ASS({
        assText: assSubs,
        video: videoElement
      });
      await ass.init();
    });
  });
</script>
```

---

# Credits

Thanks to the [ass-compiler](https://github.com/weizhenye/ass-compiler/) from weizhenye.
