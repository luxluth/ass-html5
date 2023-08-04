import type { ASSAnimation, TimeRange, Tweaks } from './types'
import type { Renderer } from './renderer'
import { changeAlpha, getAlphaFromColor } from './utils'

type AnimationObject = {
	hash: number
	animations: ASSAnimation.Animation[]
	hasEnded: boolean
	timeRange: TimeRange
	tweaks: Tweaks
	isPlaying: boolean
	handle?: number
}

export class Animate {
	animations: AnimationObject[] = []
	renderer: Renderer
	constructor(renderer: Renderer) {
		this.renderer = renderer
	}

	requestAnimation(
		animations: ASSAnimation.Animation[],
		hash: number,
		timeRange: TimeRange,
		tweaks: Tweaks
	) {
		if (!this.animations.some((animationObject) => animationObject.hash === hash)) {
			this.animations.push({
				hash,
				animations,
				hasEnded: false,
				timeRange,
				tweaks,
				isPlaying: false
			})
			this.animate()
			console.debug(
				`Requested animation ${hash} for ${timeRange.start} to ${timeRange.end} seconds\n`,
				animations
			)
			return tweaks
		} else {
			console.warn(`Animation ${hash} already exists`)
			return this.animations.find((animationObject) => animationObject.hash === hash)
				?.tweaks as Tweaks
		}
	}

	removeAnimation(hash: number) {
		window.cancelAnimationFrame(
			this.animations.find((animation) => animation.hash === hash)?.handle as number
		)
		this.animations = this.animations.filter((animation) => animation.hash !== hash)
		console.debug(`Removed animation ${hash}`)
	}

	removeAllAnimations() {
		this.animations.forEach((animation) => {
			window.cancelAnimationFrame(animation.handle as number)
		})
		this.animations = []
		// console.debug('Removed all animations')
	}

	animate() {
		this.animations.forEach((animation) => {
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

	updateAnimation(animationObj: AnimationObject) {}

	tweakColor(animation: AnimationObject, alpha: number) {
		console.debug(`Tweaking color for ${animation.hash} to ${alpha}`)
		const { primaryColor, secondaryColor, outlineColor } = animation.tweaks
		animation.tweaks.primaryColor = primaryColor
			? changeAlpha(primaryColor as string, alpha)
			: changeAlpha(this.renderer.ctx.fillStyle as string, alpha)
		// animation.tweaks.secondaryColor = secondaryColor ? changeAlpha(secondaryColor as string, alpha) :
		animation.tweaks.outlineColor = outlineColor
			? changeAlpha(outlineColor as string, alpha)
			: changeAlpha(this.renderer.ctx.strokeStyle as string, alpha)
	}
}
