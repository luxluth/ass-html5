export type ASSOptions = {
    /**
     * The ass text string
     */
    assText: string,
    /**
     * The video to display the subtile on.
     * Can be either an `HTMLVideoElement` or `string` (html query selector)
     */
    video: HTMLVideoElement | string
}
