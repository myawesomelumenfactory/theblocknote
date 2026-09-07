const INTRO_KEY = 'theblocknote.introPlayed'

function readPlayed() {
  try {
    return localStorage.getItem(INTRO_KEY) === '1'
  } catch {
    return true
  }
}

let playIntro = !readPlayed()

export function shouldPlayWindowIntro() {
  return playIntro
}

export function endIntro() {
  playIntro = false
  try {
    localStorage.setItem(INTRO_KEY, '1')
  } catch {
    // Private mode; skip later intros in this session only.
  }
}

const ENTER = { opacity: 0, y: 20, scale: 0.95 }
const REST = { opacity: 1, y: 0, scale: 1 }

export function windowMotion(transition) {
  if (!playIntro) return { initial: false }
  return {
    initial: ENTER,
    animate: REST,
    transition,
  }
}
