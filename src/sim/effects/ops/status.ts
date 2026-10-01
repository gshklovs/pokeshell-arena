// status {status, target?="target"}: a special condition (durations: docs/SPEC.md section 6)
import { STATUSES, applyStatus, type StatusName } from '../../combat'
import { TARGETS, defineOp, oneOf, who } from '../define'

export default defineOp({
  op: 'status',
  validate: (p) => [...oneOf(p, 'status', STATUSES), ...oneOf(p, 'target', TARGETS, true)],
  apply: (ctx, p) => {
    const t = who(ctx, p, 'target')
    if (t >= 0) applyStatus(ctx.s, t, p.status as StatusName)
  },
})
