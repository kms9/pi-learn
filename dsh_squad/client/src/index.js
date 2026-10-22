// The Squad page inside DS Bot (M3, D5): a sidebar button opens the console (Runs,
// Teams and rules, experiment reports); a bound group shows its Run above the composer.
// The browser half of the dsh-squad-adapter package; everything it reads and does goes
// through the adapter's host route.
import { GroupDock, SquadButton, SquadOverlay } from './shell.js'
import { startFeed } from './feed.js'
import { installStyles } from './styles.js'
import { followLinks } from './link.js'

export const inject = ['slots']

export function apply(ctx) {
  ctx.effect(() => installStyles(), 'squad: styles')
  ctx.effect(() => startFeed(), 'squad: projection feed')
  ctx.effect(() => followLinks(), 'squad: links from the group')
  const fill = (name, options, component) => ctx.effect(() => ctx.slots.inject(name, () => ctx.slots.register({ name, ...options }, component)), `squad: ${name}`)
  fill('sidebar.footer.action', { id: 'squad-open', order: -250 }, SquadButton)
  fill('shell.overlay', { id: 'squad', order: 70 }, SquadOverlay)
  fill('conversation.input.dock', { id: 'squad-run', order: -130 }, GroupDock)
}
