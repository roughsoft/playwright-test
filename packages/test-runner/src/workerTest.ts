/**
 * Copyright Microsoft Corporation. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { TestResult, TestStatus } from './ipc';
import { Modifier } from './spec';

class Runnable implements Modifier {
  title: string;
  file: string;
  location: string;
  parent?: WorkerSuite;

  _only = false;
  _skipped = false;
  _flaky = false;
  _slow = false;
  _expectedStatus?: TestStatus = 'passed';
  // Annotations are those created by test.fail('Annotation')
  _annotations: any[] = [];

  _id: string;
  _ordinal: number;

  slow(arg?: boolean | string, description?: string) {
    const processed = this._interpretCondition(arg, description);
    if (processed.condition) {
      this._slow = true;
      this._annotations.push({
        type: 'slow',
        description: processed.description
      });
    }
  }

  skip(arg?: boolean | string, description?: string) {
    const processed = this._interpretCondition(arg, description);
    if (processed.condition) {
      this._skipped = true;
      this._annotations.push({
        type: 'skip',
        description: processed.description
      });
    }
  }

  fixme(arg?: boolean | string, description?: string) {
    const processed = this._interpretCondition(arg, description);
    if (processed.condition) {
      this._skipped = true;
      this._annotations.push({
        type: 'fixme',
        description: processed.description
      });
    }
  }

  flaky(arg?: boolean | string, description?: string) {
    const processed = this._interpretCondition(arg, description);
    if (processed.condition) {
      this._flaky = true;
      this._annotations.push({
        type: 'flaky',
        description: processed.description
      });
    }
  }

  fail(arg?: boolean | string, description?: string) {
    const processed = this._interpretCondition(arg, description);
    if (processed.condition) {
      this._expectedStatus = 'failed';
      this._annotations.push({
        type: 'fail',
        description: processed.description
      });
    }
  }

  private _interpretCondition(arg?: boolean | string, description?: string): { condition: boolean, description?: string } {
    if (arg === undefined && description === undefined)
      return { condition: true };
    if (typeof arg === 'string')
      return { condition: true, description: arg };
    return { condition: !!arg, description };
  }

  isSkipped(): boolean {
    return this._skipped || (this.parent && this.parent.isSkipped());
  }

  isSlow(): boolean {
    return this._slow || (this.parent && this.parent.isSlow());
  }

  isFlaky(): boolean {
    return this._flaky || (this.parent && this.parent.isFlaky());
  }
й
  expectedStatus(): TestStatus {
    return this._expectedStatus || (this.parent && this.parent.expectedStatus()) || 'passed';
  }

  _collectAnnotations(): any[] {
    if (!this.parent)
      return this._annotations;
    return [...this._annotations, ...this.parent._collectAnnotations()];
  }
}

export class WorkerTest extends Runnable {
  fn: Function;
  results: TestResult[] = [];
  _timeout = 0;

  constructor(title: string, fn: Function) {
    super();
    this.title = title;
    this.fn = fn;
  }
}

export class WorkerSuite extends Runnable {
  suites: WorkerSuite[] = [];
  tests: WorkerTest[] = [];

  _hooks: { type: string, fn: Function } [] = [];
  _entries: (WorkerSuite | WorkerTest)[] = [];

  constructor(title: string, parent?: WorkerSuite) {
    super();
    this.title = title;
    this.parent = parent;
  }

  _addTest(test: WorkerTest) {
    test.parent = this;
    this.tests.push(test);
    this._entries.push(test);
  }

  _addSuite(suite: WorkerSuite) {
    suite.parent = this;
    this.suites.push(suite);
    this._entries.push(suite);
  }

  findTest(fn: (test: WorkerTest) => boolean | void): boolean {
    for (const suite of this.suites) {
      if (suite.findTest(fn))
        return true;
    }
    for (const test of this.tests) {
      if (fn(test))
        return true;
    }
    return false;
  }

  _allTests(): WorkerTest[] {
    const result: WorkerTest[] = [];
    this.findTest(test => { result.push(test); });
    return result;
  }

  _renumber() {
    // All tests and suites are identified with their ordinals.
    let ordinal = 0;

    ordinal = 0;
    this.findTest((test: WorkerTest) => {
      test._ordinal = ordinal++;
    });
  }

  _assignIds(configurationString: string) {
    this.findTest((test: WorkerTest) => {
      test._id = `${test._ordinal}@${this.file}::[${configurationString}]`;
    });
  }

  _addHook(type: string, fn: any) {
    this._hooks.push({ type, fn });
  }

  _hasTestsToRun(): boolean {
    let found = false;
    this.findTest(test => {
      if (!test.isSkipped()) {
        found = true;
        return true;
      }
    });
    return found;
  }
}
