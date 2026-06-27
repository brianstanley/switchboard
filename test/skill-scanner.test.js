const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseFrontmatter, scanSkillRoot } = require('../skill-scanner');

test('parseFrontmatter reads skill name and description', () => {
  const data = parseFrontmatter(`---
name: demo-skill
description: Demo skill description
---

# Demo
`);
  assert.equal(data.name, 'demo-skill');
  assert.equal(data.description, 'Demo skill description');
});

test('scanSkillRoot finds nested SKILL.md files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-skills-'));
  try {
    const skillDir = path.join(root, 'demo', 'nested');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: nested-demo
description: Nested demo
---

# Nested Demo
`);

    const skills = scanSkillRoot(root, 'Test source');
    assert.equal(skills.length, 1);
    assert.equal(skills[0].name, 'nested-demo');
    assert.equal(skills[0].description, 'Nested demo');
    assert.equal(skills[0].source, 'Test source');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
