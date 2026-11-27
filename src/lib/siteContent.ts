/**
 * Owner-supplied public content. Every value is empty until the Worldkin team provides the official URL;
 * the UI then shows a "to be supplied" state instead of a fake link or video.
 */

export type SocialKey = 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'xbrand'
export const SOCIAL_LINKS: Record<SocialKey, { label: string; url: string }> = {
  facebook: { label: 'Facebook', url: '' },
  instagram: { label: 'Instagram', url: '' },
  linkedin: { label: 'LinkedIn', url: '' },
  youtube: { label: 'YouTube', url: '' },
  xbrand: { label: 'X', url: '' },
}

/** Public source repository (provided by the owner). */
export const REPOSITORY_URL = 'https://github.com/mdraisulislam-swe/worldkin-roster'

export type VideoItem = { id: string; title: string; description: string; category: 'platform' | 'volunteer' | 'organization'; url: string }

/** Video slots shown on /media. `url` accepts a YouTube link or a direct .mp4/.webm URL. */
export const VIDEOS: VideoItem[] = [
  { id: 'intro', category: 'platform', title: 'Worldkin Roster in 3 minutes', url: '',
    description: 'What the platform does: verified organizations, capacity-safe shifts and hours confirmed by organizations.' },
  { id: 'volunteer', category: 'volunteer', title: 'Volunteer orientation', url: '',
    description: 'Finding an opportunity, applying, accepting an offer and building your experience passport.' },
  { id: 'organization', category: 'organization', title: 'For organizations', url: '',
    description: 'Verification, publishing opportunities, selecting applicants and recording attendance.' },
]
