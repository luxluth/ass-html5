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
		}
	}

	removeAnimation(hash: number) {
		window.cancelAnimationFrame(this.animations.find(animation => animation.hash === hash)?.handle as number)	
		this.animations = this.animations.filter(animation => animation.hash !== hash)
		console.debug(`Removed animation ${hash}`)
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
			switch (name) {
				case 'move': 
					if (typeof t1 === 'number' && typeof t2 === 'number') {
						// \move(<x1>,<y1>,<x2>,<y2>,<t1>,<t2>)
						const progressInAnimation = (progress - start) / (end - start)
						const progressInMove = (progress - t1) / (t2 - t1)
						const x = x1 + ((x2 as number) - x1) * progressInMove
						const y = y1 + ((y2 as number) - y1) * progressInMove
						animationObj.tweaks.position = [x, y]	
					} else {
						// \move(<x1>,<y1>,<x2>,<y2>)
						animationObj.tweaks.position = [x1, y1]
					}
					break
				case 'fad':
					// \fad(<fadein>,<fadeout>)
					if (progress < start + fadein) {
						this.tweakColor(animationObj, getAlphaFromColor(animationObj.tweaks.primaryColor as string) * (progress - start) / fadein)
					} else if (progress > end - fadeout) {
						this.tweakColor(animationObj, getAlphaFromColor(animationObj.tweaks.primaryColor as string) * (end - progress) / fadeout)
					} else {
						this.tweakColor(animationObj, getAlphaFromColor(animationObj.tweaks.primaryColor as string) * 1)
					}
					break
				case 'fade':
					// \fade(<a1>,<a2>,<a3>,<t3>,<t4>,<t5>)
					if (progress < start + (t3 as number)) {
						this.tweakColor(animationObj, getAlphaFromColor(animationObj.tweaks.primaryColor as string) * (progress - start) / (t3 as number))
					} else if (progress > end - (t5 as number)) {
						this.tweakColor(animationObj, getAlphaFromColor(animationObj.tweaks.primaryColor as string) * (end - progress) / (t5 as number))
					} else if (progress > start + (t3 as number) && progress < start + (t4 as number)) {
						this.tweakColor(animationObj, getAlphaFromColor(animationObj.tweaks.primaryColor as string) * 1)
					} else if (progress > start + (t4 as number) && progress < end - (t5 as number)) {
						this.tweakColor(animationObj, getAlphaFromColor(animationObj.tweaks.primaryColor as string) * (end - progress) / (t5 as number))
					} else if (progress > end - (t5 as number) && progress < end - (t4 as number)) {
						this.tweakColor(animationObj, getAlphaFromColor(animationObj.tweaks.primaryColor as string) * 1)
					} else if (progress > end - (t4 as number) && progress < end - (t3 as number)) {
						this.tweakColor(animationObj, getAlphaFromColor(animationObj.tweaks.primaryColor as string) * (progress - start) / (t3 as number))
					} else {
						this.tweakColor(animationObj, getAlphaFromColor(animationObj.tweaks.primaryColor as string) * 1)
					}
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
		console.debug(`Updated animation ${animationObj.hash} for ${progress} seconds\n`, animationObj.tweaks)
		this.renderer.applyTweaks(animationObj.tweaks)
	}

	tweakColor(animation: AnimationObject, alpha: number) {
		const { primaryColor, secondaryColor, outlineColor } = animation.tweaks
		animation.tweaks.primaryColor = changeAlpha(primaryColor as string, alpha)
		animation.tweaks.secondaryColor = secondaryColor ? changeAlpha(secondaryColor as string, alpha) : undefined
		animation.tweaks.outlineColor = outlineColor ? changeAlpha(outlineColor as string, alpha) : undefined
	}
}
