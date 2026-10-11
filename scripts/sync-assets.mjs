import {copyFile} from 'node:fs/promises';
for(const [source,target] of [['README.md','README.md'],['skills/donate/SKILL.md','SKILL.md'],['protocol/openapi.json','openapi.json']])await copyFile(source,'web/'+target);
