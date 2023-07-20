import type { ASSAnimation, TimeRange, Tweaks } from './types'
import type { Renderer } from './renderer'
import { changeAlpha, getAlphaFromColor } from './utils'

type AnimationObject = {
	hash: number,
	animations: ASSAnimation.Animation[]
	hasEnded: boolean,
	timeRange: TimeRange,
	tweaks: Tweaks,
	isPlaying: boolean,
	handle?: number
}

export class Animate {
	animations: AnimationObject[] = []
	renderer: Renderer
	constructor(renderer : Renderer) { this.renderer = renderer }

	requestAnimation(animations: ASSAnimation.Animation[], hash: number, timeRange: TimeRange, tweaks: Tweaks) {
		if (!this.animations.some(animationObject => animationObject.hash === hash)) {
			this.animations.push({hash, animations, hasEnded: false, timeRange, tweaks, isPlaying: false})
			this.animate()
			console.debug(`Requested animation ${hash} for ${timeRange.start} to ${timeRange.end} seconds\n`, animations)
			return tweaks
		} else {
			console.warn(`Animation ${hash} already exists`)
			return this.animations.find(animationObject => animationObject.hash === hash)?.tweaks as Tweaks
		}
	}

	removeAnimation(hash: number) {
		window.cancelAnimationFrame(this.animations.find(animation => animation.hash === hash)?.handle as number)	
		this.animations = this.animations.filter(animation => animation.hash !== hash)
		console.debug(`Removed animation ${hash}`)
	}

	removeAllAnimations() {
		this.animations.forEach(animation => {
			window.cancelAnimationFrame(animation.handle as number)
		})
		this.animations = []
        // console.debug('Removed all animations')
	}

	animate() {
		this.animations.forEach(animation => {
			if (!animation.isPlaying) {
				animation.handle = window.requestAnimationFrame(() => {
					if (animation.hasEnded) {
						this.removeAnimation(animation.hash)
					} else {
						this.updateAnimation(animation)
					}
				})
			}
		})
	}

	updateAnimation(animationObj: AnimationObject) {
		animationObj.isPlaying = true
		const { animations, timeRange } = animationObj
		const { start, end } = timeRange // in seconds
		const videoElement = this.renderer.video
		const progress = videoElement.currentTime // in seconds
		animations.forEach(animation => {
			const [x1, y1, x2, y2, t1, t2] = animation.values // move
			const [fadein, fadeout] = animation.values // fad
			const [a1, a2, a3, t3, t4, t5] = animation.values // fade
			const [orgX, orgY] = animation.values // org
			const { name } = animation
			// console.debug(`Updating animation ${name} for ${animationObj.hash}`)
			switch (name) {
				case 'move': 
					if (typeof t1 === 'number' && typeof t2 === 'number') {
						// \move(<x1>,<y1>,<x2>,<y2>,<t1>,<t2>)
						// const progressInAnimation = (progress - start) / (end - start)
						const progressInMove = (progress - t1) / (t2 - t1)
						const x = x1 + ((x2 as number) - x1) * progressInMove
						const y = y1 + ((y2 as number) - y1) * progressInMove
						animationObj.tweaks.position = [x, y]	
					} else {
						// \move(<x1>,<y1>,<x2>,<y2>)
						const progressInAnimation = (progress - start) / (end - start)
						const x = x1 + ((x2 as number) - x1) * progressInAnimation
						const y = y1 + ((y2 as number) - y1) * progressInAnimation
						animationObj.tweaks.position = [x, y]
					}
					// move progress
					console.debug(`move progress: ${animationObj.tweaks.position}`)
					break
				case 'fad':
					// \fad(<fadein>,<fadeout>)
					// Eg. \fad(1200,250)
					// 		fadein = 1200ms, fadeout = 250ms
					// 		Fade in the line in the first 1.2 seconds it is to be displayed, and fade it out for the last one quarter second it is displayed.
					if (progress < start + (fadein as number)) {
						this.renderer.ctx.globalAlpha = getAlphaFromColor(this.renderer.ctx.fillStyle as string) * 100 * (progress - start) / (fadein as number)
					} else if (progress > end - (fadeout as number)) {
						this.renderer.ctx.globalAlpha = getAlphaFromColor(this.renderer.ctx.fillStyle as string) * 100 * (end - progress) / (fadeout as number)
					} else if (progress > start + (fadein as number) && progress < end - (fadeout as number)) {
						this.renderer.ctx.globalAlpha = getAlphaFromColor(this.renderer.ctx.fillStyle as string) * 100
					} else if (progress > start + (fadein as number) && progress < end - (fadeout as number)) {
						this.renderer.ctx.globalAlpha = getAlphaFromColor(this.renderer.ctx.fillStyle as string) * 100
					}
					// fad progress
					console.debug(`fad progress: ${this.renderer.ctx.globalAlpha}`)
					break
				case 'fade':
					// \fade(<a1>,<a2>,<a3>,<t3>,<t4>,<t5>)
					// Eg. \fade(255,32,224,0,500,2000,2200)
					// 		a1 = 255, a2 = 32, a3 = 224, t3 = 0, t4 = 500, t5 = 2000, t6 = 2200
					// Starts invisible, fades to almost totally opaque, 
					// then fades to almost totally invisible. 
					// First fade starts when the line starts and lasts 500 milliseconds. 
					// Second fade starts 1500 milliseconds later, and lasts 200 milliseconds.
					// a1 = start alpha, a2 = middle alpha, a3 = end alpha
					// t3 = start time, t4 = middle time, t5 = end time
					
					if (progress < start + (t4 as number)) {
						this.renderer.ctx.globalAlpha = (a1 as number) * 100 * (progress - start) / (t4 as number)
					} else if (progress > end - (t5 as number)) {
						this.renderer.ctx.globalAlpha = (a3 as number) * 100 * (end - progress) / (t5 as number)
					} else if (progress > start + (t4 as number) && progress < end - (t5 as number)) {
						this.renderer.ctx.globalAlpha = (a2 as number) * 100
					} else if (progress > start + (t4 as number) && progress < end - (t5 as number)) {
						this.renderer.ctx.globalAlpha = (a2 as number) * 100
					}
					// fade progress
					console.debug(`fade progress: ${this.renderer.ctx.globalAlpha}`)
					break
				case 'org':
					// \org(<orgX>,<orgY>)
					// TODO: implement
					break
				default:
					break
			}
		})
		animationObj.tweaks.animations = []
		animationObj.hasEnded = progress > end
		// console.debug(`Updated animation ${animationObj.hash} for ${progress} seconds\n`)
		this.renderer.applyTweaks(animationObj.tweaks)
		window.requestAnimationFrame(() => {
			animationObj.isPlaying = false
			this.animate()
		})
	}

	tweakColor(animation: AnimationObject, alpha: number) {
		console.debug(`Tweaking color for ${animation.hash} to ${alpha}`)
		const { primaryColor, secondaryColor, outlineColor } = animation.tweaks
		animation.tweaks.primaryColor = primaryColor ? changeAlpha(primaryColor as string, alpha) : changeAlpha(this.renderer.ctx.fillStyle as string, alpha)
		// animation.tweaks.secondaryColor = secondaryColor ? changeAlpha(secondaryColor as string, alpha) : 
		animation.tweaks.outlineColor = outlineColor ? changeAlpha(outlineColor as string, alpha) : changeAlpha(this.renderer.ctx.strokeStyle as string, alpha)
	}
}
