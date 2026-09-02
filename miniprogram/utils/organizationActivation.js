const orgSession = require('./orgSession');
const authContext = require('./authContext');

async function activateOrganization(organizationId) {
  const session = orgSession.getSnapshot();
  const role = session.role === 'admin' ? 'admin' : 'user';
  const activated = await authContext.activateOrganizationContext(organizationId, role);
  return {
    activeOrg: {
      id: activated.context.organizationId,
      name: activated.context.organizationName
    },
    role: activated.context.role,
    user: activated.user,
    version: activated.version,
    context: activated.context
  };
}

module.exports = { activateOrganization };
