'use strict';
const home = require('../../locales/zh-CN/home');
const calendar = require('../../locales/zh-CN/calendar');
const copy = { name: home.text.name, workRole: home.text.regularPosition, noWorkRole: calendar.noPosition, empty: '' };
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    people: { type: Array, value: [] },
    emptyText: { type: String, value: '' },
    historicalPositionText: { type: String, value: '' }
  },
  data: { copy, rows: [] },
  observers: {
    'people, historicalPositionText': function(people, historicalPositionText) {
      this.setData({ rows: (people || []).map((person, index) => ({
        key: index,
        name: person.name || person.targetName || '',
        personReference: person.personReference || '',
        assignmentId: person.targetAssignmentId || person.assignmentId || '',
        hrId: person.hrId || person.targetHrId || '',
        personId: person.personId || '',
        positionNotice: person.positionNotice || (person.historicalAssignmentUnavailable ? historicalPositionText : ''),
        positions: (person.positions || [{identityCategory:person.identity || person.targetIdentity || '',department:person.department || person.targetDepartment || '',workGroup:person.workGroup || person.targetWorkGroup || ''}]).filter(position => position && (position.label || position.identityCategory || position.department || position.workGroup)).map(position => ({
          label: position.label || '',
          identityCategory: position.identityCategory || '',
          context: [position.department, position.workGroup].filter(Boolean).join(' · ')
        }))
      })) });
    }
  }
});
