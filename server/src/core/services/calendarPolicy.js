'use strict';
const directory = require('./contactDirectoryPolicy');
const { CalendarError } = require('./calendarRecurrence');
const ACTIONS = new Set(['assign', 'update', 'cancel']);

function normalize(input) {
  try {
    const rule = directory.normalizeRule(Object.assign({}, input, {fieldIds:[]}));
    if (!Array.isArray(input.actions) || !input.actions.length || input.actions.some(value=>!ACTIONS.has(value))) throw new CalendarError('invalidRule');
    return Object.assign(rule, {actions:Array.from(new Set(input.actions)).sort()});
  } catch (error) {
    if (error instanceof directory.DirectoryError) throw new CalendarError(error.code);
    throw error;
  }
}
function viewer(actor, catalog) {
  const person = catalog.people.find(value=>value.personId === actor.personId);
  const assignment = person && person.assignments.find(value=>value.id === actor.assignmentId);
  if (actor.assignmentId && !assignment) throw new CalendarError('forbidden');
  return { personId:actor.personId, assignment:assignment || null };
}
function allowedPeople(rules, action, actor, catalog) {
  if (!ACTIONS.has(action)) throw new CalendarError('invalidRule');
  const valid = [];
  for (const input of rules) {
    try {
      const rule = normalize(input);
      if (rule.actions.includes(action)) valid.push(rule);
    } catch (error) {
      if (!(error instanceof CalendarError)) throw error;
    }
  }
  const result = directory.grants(valid, catalog.people, viewer(actor,catalog), catalog);
  return new Set([actor.personId,...result.map(item=>item.person.personId)]);
}
function selectedAssignments(clauses, actor, catalog, options = {}) {
  let targets;
  try { targets = directory.normalizeClauses(clauses,true); }
  catch (error) { if (error instanceof directory.DirectoryError) throw new CalendarError(error.code); throw error; }
  const rule = {name:'calendar',enabled:true,audience:[],targets,fieldIds:[]};
  try { if (!options.dynamic) directory.validateReferences(rule,catalog); }
  catch (error) { if (error instanceof directory.DirectoryError) throw new CalendarError(error.code); throw error; }
  const currentViewer = viewer(actor,catalog);
  // 管理权限可以独立于成员岗位存在。临时索引只用于条件发起者匹配，绝不作为可选参会人返回。
  const evaluationCatalog = catalog.people.some(person=>person.personId === actor.personId) ? catalog
    : Object.assign({},catalog,{people:catalog.people.concat([{personId:actor.personId,assignments:[]}])});
  rule.audience = [{type:'people',personIds:[actor.personId]}];
  return directory.grants([rule],catalog.people,currentViewer,evaluationCatalog);
}
function selectedPeople(clauses, actor, catalog, options) {
  return Array.from(new Set(selectedAssignments(clauses,actor,catalog,options).map(item=>item.person.personId)));
}
function assertSelection(selected, allowed) {
  if (selected.some(id=>!allowed.has(id))) throw new CalendarError('forbidden');
}
function hasExited(exits, personId, occurrenceDate) {
  return exits.some(exit=>exit.personId === personId && (exit.scope === 'series'
    || (exit.scope === 'following' && occurrenceDate >= exit.occurrenceDate)
    || (exit.scope === 'instance' && occurrenceDate === exit.occurrenceDate)));
}
module.exports = { normalize, viewer, allowedPeople, selectedPeople, selectedAssignments, assertSelection, hasExited };
