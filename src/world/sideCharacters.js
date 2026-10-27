import * as THREE from 'three';
import { createHujurCharacter, createNiqabCharacter, animateCharacterWalk, moveCampusNPCTo } from '../player/campusCharacters.js';

/**
 * Authentic 3D Campus Side Characters placed at landmark locations across Islamic University:
 * 1. Central Mosque (কেন্দ্রীয় মসজিদ): Senior Imam in ivory robe and crimson houndstooth keffiyeh.
 * 2. Faculty of Theology (ধর্মতত্ত্ব অনুষদ): Respected Islamic Studies scholar in olive/sand robe.
 * 3. Main Gate Promenade (প্রধান ফটক ওয়াকওয়ে): Niqab student walking toward campus entrance.
 * 4. Central Library (কেন্দ্রীয় গ্রন্থাগার): Scholar & Niqab student in discussion.
 */
export class CampusSideCharacters {
  constructor(queries) {
    this.queries = queries;
    this.group = new THREE.Group();
    this.group.name = 'islamic-university-side-characters';
    this.characters = [];
    this.time = 0;

    this.spawnCharacters();
  }

  spawnCharacters() {
    const sideNpcDefs = [
      {
        id: 'central-mosque-imam',
        name: 'Imam (কেন্দ্রীয় মসজিদ)',
        type: 'hujur',
        options: {
          robeColor: '#f7f6ee',
          scarfColor: '#9e2528',
          beardColor: '#2b231f',
          skinColor: '#ba8667',
          scale: 0.88,
        },
        x: -122.0,
        z: -108.0,
        yaw: 1.2,
        behavior: 'idle',
      },
      {
        id: 'theology-faculty-scholar',
        name: 'Professor of Hadith (ধর্মতত্ত্ব অনুষদ)',
        type: 'hujur',
        options: {
          robeColor: '#e5ded0',
          scarfColor: '#246345',
          beardColor: '#453c35',
          skinColor: '#c4906f',
          scale: 0.88,
        },
        x: -155.0,
        z: -78.0,
        yaw: -0.85,
        behavior: 'patrol',
        waypointA: { x: -155.0, z: -78.0 },
        waypointB: { x: -142.0, z: -88.0 },
      },
      {
        id: 'main-gate-student-niqab',
        name: 'Student (প্রধান ফটক)',
        type: 'niqab',
        options: {
          robeColor: '#1a1a1f',
          scarfColor: '#121216',
          skinColor: '#cca383',
          scale: 0.85,
        },
        x: 288.0,
        z: -56.0,
        yaw: 2.1,
        behavior: 'patrol',
        waypointA: { x: 288.0, z: -56.0 },
        waypointB: { x: 268.0, z: -50.0 },
      },
      {
        id: 'library-scholar',
        name: 'Researcher (কেন্দ্রীয় গ্রন্থাগার)',
        type: 'hujur',
        options: {
          robeColor: '#ebe7da',
          scarfColor: '#8a2325',
          beardColor: '#201b17',
          scale: 0.86,
        },
        x: 62.0,
        z: -128.0,
        yaw: -1.8,
        behavior: 'idle',
      },
      {
        id: 'library-student-niqab',
        name: 'Student (কেন্দ্রীয় গ্রন্থাগার)',
        type: 'niqab',
        options: {
          robeColor: '#202228',
          scarfColor: '#181a20',
          skinColor: '#d2aa8c',
          scale: 0.84,
        },
        x: 64.2,
        z: -129.5,
        yaw: 1.3,
        behavior: 'idle',
      },
    ];

    for (const def of sideNpcDefs) {
      const model = def.type === 'niqab'
        ? createNiqabCharacter(def.options)
        : createHujurCharacter(def.options);

      const y = this.queries ? this.queries.groundHeight(def.x, def.z) : 0;
      model.position.set(def.x, y, def.z);
      model.rotation.y = def.yaw;

      this.group.add(model);
      this.characters.push({
        ...def,
        model,
        currentTarget: def.waypointB || null,
        walkSpeed: 0.95,
      });
    }
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.time += dt;

    for (const char of this.characters) {
      if (char.behavior === 'patrol' && char.currentTarget) {
        const speed = moveCampusNPCTo(char.model, char.currentTarget, dt, char.walkSpeed);
        if (this.queries) {
          char.model.position.y = this.queries.groundHeight(char.model.position.x, char.model.position.z);
        }
        animateCharacterWalk(char.model, dt, speed);

        const dist = Math.hypot(char.model.position.x - char.currentTarget.x, char.model.position.z - char.currentTarget.z);
        if (dist < 0.25) {
          char.currentTarget = char.currentTarget === char.waypointB ? char.waypointA : char.waypointB;
        }
      } else {
        // Idle animation: subtle breathing and gentle head look
        animateCharacterWalk(char.model, dt, 0);
        const rig = char.model.userData?.campusRig;
        if (rig?.headPivot) {
          rig.headPivot.rotation.y = Math.sin(this.time * 0.8 + char.x) * 0.18;
          rig.headPivot.rotation.x = 0.02 + Math.sin(this.time * 1.4) * 0.015;
        }
      }
    }
  }

  dispose() {
    for (const char of this.characters) {
      char.model.traverse(obj => {
        obj.geometry?.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
    }
    this.characters.length = 0;
    this.group.clear();
  }
}
