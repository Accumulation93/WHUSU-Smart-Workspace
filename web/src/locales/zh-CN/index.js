import admin from './admin.js';
import audit from './audit.js';
import common from './common.js';
import errors from './errors.js';
import hero from './hero.js';
import hr from './hr.js';
import login from './login.js';
import messages from './messages.js';
import portal from './portal.js';
import scoring from './scoring.js';
import system from './system.js';
import venue from './venue.js';
import verify from './verify.js';
import workRole from './workRole.js';
import workbench from './workbench.js';
import withAliases from './aliases.js';

const copy = Object.freeze({
  admin: withAliases(admin),
  audit: withAliases(audit),
  common: withAliases(common),
  errors: withAliases(errors),
  hero: withAliases(hero),
  hr: withAliases(hr),
  login: withAliases(login),
  messages: withAliases(messages),
  portal: withAliases(portal),
  scoring: withAliases(scoring),
  system: withAliases(system),
  venue: withAliases(venue),
  verify: withAliases(verify),
  workRole: withAliases(workRole),
  workbench: withAliases(workbench)
});

export default copy;
