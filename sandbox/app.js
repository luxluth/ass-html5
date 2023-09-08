/**@type HTMLCanvasElement*/
const canvas = document.querySelector('#canvas')

/**@type CanvasRenderingContext2D */
const ctx = canvas.getContext('2d')
// console.log(ctx);

const text = 'Hello World'

ctx.font = '40px Times New Roman'
ctx.fillStyle = 'blue'
ctx.strokeStyle = 'red'

const textWidth = ctx.measureText(text).width

// ctx.strokeText(text, 50, 50);
// ctx.fillText(text, 50, 50);

// // text stretchX (less than 100%)
// ctx.strokeText(text, 50, 80, textWidth / 1.5);
// ctx.fillText(text, 50, 80, textWidth / 1.5);

// // text stretchX (more than 100%) - using transformation
// ctx.save();
// ctx.translate(50, 120);
// ctx.scale(1.5, 1);
// ctx.strokeText(text, 0, 0);
// ctx.fillText(text, 0, 0);
// ctx.restore();

// // text stretchY
// ctx.save();
// ctx.translate(50, 160);
// ctx.scale(1, 1.5);
// ctx.strokeText(text, 0, 0);
// ctx.fillText(text, 0, 0);
// ctx.restore();

// // text stretchX and stretchY
// ctx.save();
// ctx.translate(50, 200);
// ctx.scale(1.5, 1.5);
// ctx.strokeText(text, 0, 0);
// ctx.fillText(text, 0, 0);
// ctx.restore();

// // text skewX
// ctx.save();
// ctx.translate(50, 240);
// ctx.transform(1, 0, 0.5, 1, 0, 0);
// ctx.strokeText(text, 0, 0);
// ctx.fillText(text, 0, 0);
// ctx.restore();

// // text skewY
// ctx.save();
// ctx.translate(50, 280);
// ctx.transform(1, 0.5, 0, 1, 0, 0);
// ctx.strokeText(text, 0, 0);
// ctx.fillText(text, 0, 0);
// ctx.restore();

// // text skewZ
// ctx.save();
// ctx.translate(50, 320);
// ctx.transform(1, 0, 0.5, 1, 0, 0);
// ctx.transform(1, 0.5, 0, 1, 0, 0);
// ctx.strokeText(text, 0, 0);
// ctx.fillText(text, 0, 0);
// ctx.restore();

// // text rotate
// ctx.save();
// ctx.translate(50, 360);
// ctx.rotate(Math.PI / 4);
// ctx.strokeText(text, 0, 0);
// ctx.fillText(text, 0, 0);
// ctx.restore();

// fade text
function fade(startAlpha, endAlpha, durationInMs) {
	const startTime = Date.now()
	const endTime = startTime + durationInMs

	function update() {
		console.log('update')
		const now = Date.now()
		const elapsed = now - startTime
		const alpha = startAlpha + ((endAlpha - startAlpha) * elapsed) / durationInMs

		ctx.clearRect(0, 0, canvas.width, canvas.height)
		ctx.globalAlpha = alpha
		ctx.strokeText(text, 50, 400)
		ctx.fillText(text, 50, 400)

		if (now < endTime) {
			requestAnimationFrame(update)
		}
	}

	requestAnimationFrame(update)
}

// move text
function move(startX, startY, endX, endY, durationInMs) {
	const startTime = Date.now()
	const endTime = startTime + durationInMs

	function update() {
		console.log('update')
		const now = Date.now()
		const elapsed = now - startTime
		const x = startX + ((endX - startX) * elapsed) / durationInMs
		const y = startY + ((endY - startY) * elapsed) / durationInMs

		ctx.clearRect(0, 0, canvas.width, canvas.height)
		ctx.strokeText(text, x, y)
		ctx.fillText(text, x, y)

		if (now < endTime) {
			requestAnimationFrame(update)
		}
	}

	requestAnimationFrame(update)
}

// move text complex
function moveComplex(startX, startY, endX, endY, delayBeforeAnimationInMs, durationInMs) {
	const startTime = Date.now() + delayBeforeAnimationInMs
	const endTime = startTime + durationInMs

	function update() {
		console.log('update')
		const now = Date.now()
		const elapsed = now - startTime
		const x = startX + ((endX - startX) * elapsed) / durationInMs
		const y = startY + ((endY - startY) * elapsed) / durationInMs

		ctx.clearRect(0, 0, canvas.width, canvas.height)
		ctx.strokeText(text, x, y)
		ctx.fillText(text, x, y)

		if (now < endTime) {
			requestAnimationFrame(update)
		}
	}

	// first draw
	ctx.strokeText(text, startX, startY)
	ctx.fillText(text, startX, startY)
	setTimeout(() => {
		requestAnimationFrame(update)
	}, delayBeforeAnimationInMs)
}

// Rotation origin \org(<X>,<Y>)
// example: \org(320,240) rotate around the point (320,240)
function org(originX, originY, durationInMs) {
	const startTime = Date.now()
	const endTime = startTime + durationInMs

	function update() {
		console.log('update')
		const now = Date.now()
		const elapsed = now - startTime
		const angle = (Math.PI * 2 * elapsed) / durationInMs

		ctx.clearRect(0, 0, canvas.width, canvas.height)
		ctx.save()
		ctx.transform(1, 0, 0, 1, originX, originY)
		ctx.rotate(angle)
		ctx.strokeText(text, 0, 0)
		ctx.fillText(text, 0, 0)
		ctx.restore()

		if (now < endTime) {
			requestAnimationFrame(update)
		}
	}

	requestAnimationFrame(update)
}

// fade(1, 0, 1000);
// move(50, 400, 50, 50, 3000);
// moveComplex(50, 400, 50, 50, 1000, 3000);
// finding the center of the center position of the text
const w = ctx.measureText(text).width
const h = ctx.measureText('M').width
const x = 50 + w / 2
const y = 400 + h / 2
org(x, y, 3000)
