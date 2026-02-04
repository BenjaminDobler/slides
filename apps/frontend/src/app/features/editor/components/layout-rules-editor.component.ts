import { Component, inject, output, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LayoutRuleService } from '../../../core/services/layout-rule.service';
import type {
  LayoutRuleDto,
  LayoutConditions,
  LayoutTransform,
  NumericCondition,
  WrapOptions,
  SplitTwoOptions,
  SplitTopBottomOptions,
  GroupByHeadingOptions,
} from '@slides/shared-types';

type TransformType = 'wrap' | 'split-two' | 'split-top-bottom' | 'group-by-heading';

@Component({
  selector: 'app-layout-rules-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './layout-rules-editor.component.html',
  styleUrl: './layout-rules-editor.component.scss',
})
export class LayoutRulesEditorComponent implements OnInit {
  private layoutRuleService = inject(LayoutRuleService);

  closed = output<void>();
  rulesChanged = output<void>();

  rules = signal<LayoutRuleDto[]>([]);
  view = signal<'list' | 'edit'>('list');
  editingRule = signal<LayoutRuleDto | null>(null);
  saving = signal(false);
  error = signal('');

  // Edit form fields
  name = '';
  displayName = '';
  description = '';
  priority = 100;
  enabled = true;
  cssContent = '';
  transformType: TransformType = 'wrap';

  // Condition toggles
  condHasHeading: boolean | null = null;
  condHasCards: boolean | null = null;
  condHasList: boolean | null = null;
  condHasCodeBlock: boolean | null = null;
  condHasBlockquote: boolean | null = null;
  condImageCountEnabled = false;
  condImageCountOp: 'eq' | 'gte' | 'lte' | 'gt' = 'eq';
  condImageCountVal = 0;
  condH3CountEnabled = false;
  condH3CountOp: 'eq' | 'gte' | 'lte' | 'gt' = 'gte';
  condH3CountVal = 2;
  condTextParaEnabled = false;
  condTextParaOp: 'eq' | 'gte' | 'lte' | 'gt' = 'lte';
  condTextParaVal = 1;

  // Transform options
  wrapClassName = 'layout-hero';
  splitTwoClassName = 'layout-text-image';
  splitTwoLeftSelector: 'text' | 'cards' = 'text';
  splitTwoLeftClassName = 'layout-body';
  splitTwoRightClassName = 'layout-media';
  splitTopBottomClassName = 'layout-image-grid';
  groupHeadingLevel = 3;
  groupContainerClassName = 'layout-sections';
  groupColumnClassName = 'layout-section-col';

  ngOnInit() {
    this.rules.set(this.layoutRuleService.rules());
  }

  startNew() {
    this.editingRule.set(null);
    this.resetForm();
    this.view.set('edit');
  }

  startEdit(rule: LayoutRuleDto) {
    this.editingRule.set(rule);
    this.loadRuleIntoForm(rule);
    this.view.set('edit');
  }

  backToList() {
    this.view.set('list');
    this.error.set('');
  }

  toggleEnabled(rule: LayoutRuleDto) {
    if (rule.isDefault) return;
    this.layoutRuleService.updateRule(rule.id, { enabled: !rule.enabled }).subscribe({
      next: () => {
        this.refreshRules();
        this.rulesChanged.emit();
      },
      error: (err) => this.error.set(err?.error?.error || 'Failed to update rule'),
    });
  }

  deleteRule(rule: LayoutRuleDto) {
    if (rule.isDefault) return;
    this.layoutRuleService.deleteRule(rule.id).subscribe({
      next: () => {
        this.refreshRules();
        this.rulesChanged.emit();
      },
      error: (err) => this.error.set(err?.error?.error || 'Failed to delete rule'),
    });
  }

  save() {
    if (!this.name || !this.displayName) return;
    this.saving.set(true);
    this.error.set('');

    const conditions = this.buildConditions();
    const transform = this.buildTransform();
    const editing = this.editingRule();

    if (editing) {
      this.layoutRuleService.updateRule(editing.id, {
        displayName: this.displayName,
        description: this.description || undefined,
        priority: this.priority,
        enabled: this.enabled,
        conditions,
        transform,
        cssContent: this.cssContent,
      }).subscribe({
        next: () => {
          this.saving.set(false);
          this.refreshRules();
          this.rulesChanged.emit();
          this.view.set('list');
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err?.error?.error || 'Failed to update rule');
        },
      });
    } else {
      this.layoutRuleService.createRule({
        name: this.name,
        displayName: this.displayName,
        description: this.description || undefined,
        priority: this.priority,
        enabled: this.enabled,
        conditions,
        transform,
        cssContent: this.cssContent,
      }).subscribe({
        next: () => {
          this.saving.set(false);
          this.refreshRules();
          this.rulesChanged.emit();
          this.view.set('list');
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err?.error?.error || 'Failed to create rule');
        },
      });
    }
  }

  private refreshRules() {
    this.layoutRuleService.loadRules().then(() => {
      this.rules.set(this.layoutRuleService.rules());
    });
  }

  private resetForm() {
    this.name = '';
    this.displayName = '';
    this.description = '';
    this.priority = 100;
    this.enabled = true;
    this.cssContent = '';
    this.transformType = 'wrap';
    this.condHasHeading = null;
    this.condHasCards = null;
    this.condHasList = null;
    this.condHasCodeBlock = null;
    this.condHasBlockquote = null;
    this.condImageCountEnabled = false;
    this.condImageCountOp = 'eq';
    this.condImageCountVal = 0;
    this.condH3CountEnabled = false;
    this.condH3CountOp = 'gte';
    this.condH3CountVal = 2;
    this.condTextParaEnabled = false;
    this.condTextParaOp = 'lte';
    this.condTextParaVal = 1;
    this.wrapClassName = 'layout-hero';
    this.splitTwoClassName = 'layout-text-image';
    this.splitTwoLeftSelector = 'text';
    this.splitTwoLeftClassName = 'layout-body';
    this.splitTwoRightClassName = 'layout-media';
    this.splitTopBottomClassName = 'layout-image-grid';
    this.groupHeadingLevel = 3;
    this.groupContainerClassName = 'layout-sections';
    this.groupColumnClassName = 'layout-section-col';
  }

  private loadRuleIntoForm(rule: LayoutRuleDto) {
    this.name = rule.name;
    this.displayName = rule.displayName;
    this.description = rule.description || '';
    this.priority = rule.priority;
    this.enabled = rule.enabled;
    this.cssContent = rule.cssContent;

    // Conditions
    const c = rule.conditions;
    this.condHasHeading = c.hasHeading ?? null;
    this.condHasCards = c.hasCards ?? null;
    this.condHasList = c.hasList ?? null;
    this.condHasCodeBlock = c.hasCodeBlock ?? null;
    this.condHasBlockquote = c.hasBlockquote ?? null;

    if (c.imageCount) {
      this.condImageCountEnabled = true;
      const nc = c.imageCount;
      if (nc.eq !== undefined) { this.condImageCountOp = 'eq'; this.condImageCountVal = nc.eq; }
      else if (nc.gte !== undefined) { this.condImageCountOp = 'gte'; this.condImageCountVal = nc.gte; }
      else if (nc.lte !== undefined) { this.condImageCountOp = 'lte'; this.condImageCountVal = nc.lte; }
      else if (nc.gt !== undefined) { this.condImageCountOp = 'gt'; this.condImageCountVal = nc.gt; }
    } else {
      this.condImageCountEnabled = false;
    }

    if (c.h3Count) {
      this.condH3CountEnabled = true;
      const nc = c.h3Count;
      if (nc.eq !== undefined) { this.condH3CountOp = 'eq'; this.condH3CountVal = nc.eq; }
      else if (nc.gte !== undefined) { this.condH3CountOp = 'gte'; this.condH3CountVal = nc.gte; }
      else if (nc.lte !== undefined) { this.condH3CountOp = 'lte'; this.condH3CountVal = nc.lte; }
      else if (nc.gt !== undefined) { this.condH3CountOp = 'gt'; this.condH3CountVal = nc.gt; }
    } else {
      this.condH3CountEnabled = false;
    }

    if (c.textParagraphCount) {
      this.condTextParaEnabled = true;
      const nc = c.textParagraphCount;
      if (nc.eq !== undefined) { this.condTextParaOp = 'eq'; this.condTextParaVal = nc.eq; }
      else if (nc.gte !== undefined) { this.condTextParaOp = 'gte'; this.condTextParaVal = nc.gte; }
      else if (nc.lte !== undefined) { this.condTextParaOp = 'lte'; this.condTextParaVal = nc.lte; }
      else if (nc.gt !== undefined) { this.condTextParaOp = 'gt'; this.condTextParaVal = nc.gt; }
    } else {
      this.condTextParaEnabled = false;
    }

    // Transform
    const t = rule.transform;
    this.transformType = t.type;
    switch (t.type) {
      case 'wrap': {
        const o = t.options as WrapOptions;
        this.wrapClassName = o.className;
        break;
      }
      case 'split-two': {
        const o = t.options as SplitTwoOptions;
        this.splitTwoClassName = o.className;
        this.splitTwoLeftSelector = o.leftSelector;
        this.splitTwoLeftClassName = o.leftClassName;
        this.splitTwoRightClassName = o.rightClassName;
        break;
      }
      case 'split-top-bottom': {
        const o = t.options as SplitTopBottomOptions;
        this.splitTopBottomClassName = o.className;
        break;
      }
      case 'group-by-heading': {
        const o = t.options as GroupByHeadingOptions;
        this.groupHeadingLevel = o.headingLevel;
        this.groupContainerClassName = o.containerClassName;
        this.groupColumnClassName = o.columnClassName;
        break;
      }
    }
  }

  private buildConditions(): LayoutConditions {
    const c: LayoutConditions = {};
    if (this.condHasHeading !== null) c.hasHeading = this.condHasHeading;
    if (this.condHasCards !== null) c.hasCards = this.condHasCards;
    if (this.condHasList !== null) c.hasList = this.condHasList;
    if (this.condHasCodeBlock !== null) c.hasCodeBlock = this.condHasCodeBlock;
    if (this.condHasBlockquote !== null) c.hasBlockquote = this.condHasBlockquote;
    if (this.condImageCountEnabled) {
      c.imageCount = { [this.condImageCountOp]: this.condImageCountVal } as NumericCondition;
    }
    if (this.condH3CountEnabled) {
      c.h3Count = { [this.condH3CountOp]: this.condH3CountVal } as NumericCondition;
    }
    if (this.condTextParaEnabled) {
      c.textParagraphCount = { [this.condTextParaOp]: this.condTextParaVal } as NumericCondition;
    }
    return c;
  }

  private buildTransform(): LayoutTransform {
    switch (this.transformType) {
      case 'wrap':
        return { type: 'wrap', options: { className: this.wrapClassName } };
      case 'split-two':
        return {
          type: 'split-two',
          options: {
            className: this.splitTwoClassName,
            leftSelector: this.splitTwoLeftSelector,
            rightSelector: 'media',
            leftClassName: this.splitTwoLeftClassName,
            rightClassName: this.splitTwoRightClassName,
          },
        };
      case 'split-top-bottom':
        return {
          type: 'split-top-bottom',
          options: {
            className: this.splitTopBottomClassName,
            bottomSelector: 'media',
          },
        };
      case 'group-by-heading':
        return {
          type: 'group-by-heading',
          options: {
            headingLevel: this.groupHeadingLevel,
            containerClassName: this.groupContainerClassName,
            columnClassName: this.groupColumnClassName,
          },
        };
    }
  }

  boolLabel(val: boolean | null): string {
    if (val === null) return 'Any';
    return val ? 'Yes' : 'No';
  }

  cycleBool(field: 'condHasHeading' | 'condHasCards' | 'condHasList' | 'condHasCodeBlock' | 'condHasBlockquote') {
    const current = this[field];
    if (current === null) this[field] = true;
    else if (current === true) this[field] = false;
    else this[field] = null;
  }
}
