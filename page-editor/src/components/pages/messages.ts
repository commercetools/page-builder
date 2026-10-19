import { defineMessages } from 'react-intl';

export default defineMessages({
  siteBuilderLabel: {
    id: 'Pages.siteBuilderLabel',
    defaultMessage: 'SITE BUILDER',
  },
  title: {
    id: 'Pages.title',
    defaultMessage: 'Pages',
  },
  import: {
    id: 'Pages.import',
    defaultMessage: 'Import',
  },
  newPage: {
    id: 'Pages.newPage',
    defaultMessage: 'New page',
  },
  previewSettings: {
    id: 'Pages.previewSettings',
    defaultMessage: 'Preview settings',
  },
  searchPages: {
    id: 'Pages.searchPages',
    defaultMessage: 'Search pages...',
  },
  noPagesFound: {
    id: 'Pages.noPagesFound',
    defaultMessage: 'No pages found',
  },
  selectAPage: {
    id: 'Pages.selectAPage',
    defaultMessage: 'Select a page to view details',
  },
  // PageDetail breadcrumb
  breadcrumbPages: {
    id: 'Pages.breadcrumbPages',
    defaultMessage: 'Pages',
  },
  // PageDetail header buttons
  preview: {
    id: 'Pages.preview',
    defaultMessage: 'Preview',
  },
  openInPageBuilder: {
    id: 'Pages.openInPageBuilder',
    defaultMessage: 'Open in page builder',
  },
  // About card
  aboutThisPage: {
    id: 'Pages.aboutThisPage',
    defaultMessage: 'About this page',
  },
  aboutSlugLabel: {
    id: 'Pages.aboutSlugLabel',
    defaultMessage: 'Slug',
  },
  aboutTypeLabel: {
    id: 'Pages.aboutTypeLabel',
    defaultMessage: 'Type',
  },
  aboutCategoryLabel: {
    id: 'Pages.aboutCategoryLabel',
    defaultMessage: 'CT category',
  },
  aboutMarketsLabel: {
    id: 'Pages.aboutMarketsLabel',
    defaultMessage: 'Markets',
  },
  aboutMarketsValue: {
    id: 'Pages.aboutMarketsValue',
    defaultMessage: 'All markets',
  },
  aboutLanguagesLabel: {
    id: 'Pages.aboutLanguagesLabel',
    defaultMessage: 'Languages',
  },
  aboutLanguagesValue: {
    id: 'Pages.aboutLanguagesValue',
    defaultMessage: 'EN, DE, FR',
  },
  aboutLastEditedLabel: {
    id: 'Pages.aboutLastEditedLabel',
    defaultMessage: 'Last edited',
  },
  // Page type labels
  typeCategoryPage: {
    id: 'Pages.typeCategoryPage',
    defaultMessage: 'Category page',
  },
  typeTemplate: {
    id: 'Pages.typeTemplate',
    defaultMessage: 'Template',
  },
  typeDynamicPage: {
    id: 'Pages.typeDynamicPage',
    defaultMessage: 'Dynamic page',
  },
  typeStandardPage: {
    id: 'Pages.typeStandardPage',
    defaultMessage: 'Standard page',
  },
  // Page assignment card
  pageAssignment: {
    id: 'Pages.pageAssignment',
    defaultMessage: 'Page assignment',
  },
  noDedicatedPage: {
    id: 'Pages.noDedicatedPage',
    defaultMessage: 'No dedicated page',
  },
  fallbackDescription: {
    id: 'Pages.fallbackDescription',
    defaultMessage:
      'This category falls back to <strong>All categories</strong>. Create a dedicated page to give it a custom layout, hero or recommendations.',
  },
  createDedicatedPage: {
    id: 'Pages.createDedicatedPage',
    defaultMessage: 'Create dedicated page',
  },
  editFallback: {
    id: 'Pages.editFallback',
    defaultMessage: 'Edit fallback',
  },
  // Create dedicated page dialog
  createDedicatedDialogTitle: {
    id: 'Pages.createDedicatedDialogTitle',
    defaultMessage: 'Create dedicated page',
  },
  createDedicatedDialogDescription: {
    id: 'Pages.createDedicatedDialogDescription',
    defaultMessage:
      'How would you like to start the dedicated page for {category}?',
  },
  createDedicatedStartEmptyLabel: {
    id: 'Pages.createDedicatedStartEmptyLabel',
    defaultMessage: 'Start from an empty page',
  },
  createDedicatedStartEmptyHint: {
    id: 'Pages.createDedicatedStartEmptyHint',
    defaultMessage: 'Begin with a blank canvas and build the layout yourself.',
  },
  createDedicatedCopyFallbackLabel: {
    id: 'Pages.createDedicatedCopyFallbackLabel',
    defaultMessage: 'Copy the fallback as a base',
  },
  createDedicatedCopyFallbackHint: {
    id: 'Pages.createDedicatedCopyFallbackHint',
    defaultMessage:
      'Start with a copy of the “All categories” fallback content, then customize it.',
  },
  createDedicatedCopyFallbackUnavailable: {
    id: 'Pages.createDedicatedCopyFallbackUnavailable',
    defaultMessage: 'The “All categories” fallback has no content to copy yet.',
  },
  createDedicatedDialogCancel: {
    id: 'Pages.createDedicatedDialogCancel',
    defaultMessage: 'Cancel',
  },
  // Create PDP override dialog
  createOverrideDialogTitle: {
    id: 'Pages.createOverrideDialogTitle',
    defaultMessage: 'Create PDP override',
  },
  createOverrideDialogDescription: {
    id: 'Pages.createOverrideDialogDescription',
    defaultMessage:
      'How would you like to start the product detail page for {category}?',
  },
  createOverrideCopyGlobalLabel: {
    id: 'Pages.createOverrideCopyGlobalLabel',
    defaultMessage: 'Copy the All categories PDP as a base',
  },
  createOverrideCopyGlobalHint: {
    id: 'Pages.createOverrideCopyGlobalHint',
    defaultMessage:
      'Start with a copy of the “All categories” PDP, then customize it.',
  },
  createOverrideCopyGlobalUnavailable: {
    id: 'Pages.createOverrideCopyGlobalUnavailable',
    defaultMessage: 'The “All categories” PDP has no content to copy yet.',
  },
  // Page assignment rows
  assignmentStatusLabel: {
    id: 'Pages.assignmentStatusLabel',
    defaultMessage: 'Status',
  },
  assignmentVersionLabel: {
    id: 'Pages.assignmentVersionLabel',
    defaultMessage: 'Version',
  },
  assignmentPublishedLabel: {
    id: 'Pages.assignmentPublishedLabel',
    defaultMessage: 'Published',
  },
  assignmentDraftsLabel: {
    id: 'Pages.assignmentDraftsLabel',
    defaultMessage: 'Drafts',
  },
  assignmentUnpublishedChanges: {
    id: 'Pages.assignmentUnpublishedChanges',
    defaultMessage:
      '{count} unpublished {count, plural, one {change} other {changes}}',
  },
  assignmentUpToDate: {
    id: 'Pages.assignmentUpToDate',
    defaultMessage: 'Up to date',
  },
  lastSaved: {
    id: 'Pages.lastSaved',
    defaultMessage: 'Last saved {date}',
  },
  // Version history
  recentActivity: {
    id: 'Pages.recentActivity',
    defaultMessage: 'Recent activity',
  },
  versionDraftSaved: {
    id: 'Pages.versionDraftSaved',
    defaultMessage: 'Draft saved',
  },
  versionPublished: {
    id: 'Pages.versionPublished',
    defaultMessage: 'Published',
  },
  // page tree badges
  pageTreePageBadge: {
    id: 'Pages.pageTreePageBadge',
    defaultMessage: 'Page',
  },
  pageTreeFallbackBadge: {
    id: 'Pages.pageTreeFallbackBadge',
    defaultMessage: 'fallback',
  },
  pageTreePlpBadge: {
    id: 'Pages.pageTreePlpBadge',
    defaultMessage: 'PLP',
  },
  pageTreePdpBadge: {
    id: 'Pages.pageTreePdpBadge',
    defaultMessage: 'PDP',
  },
  pageTreeAllBadge: {
    id: 'Pages.pageTreeAllBadge',
    defaultMessage: 'All',
  },
  // Segment control
  viewCategoryPage: {
    id: 'Pages.viewCategoryPage',
    defaultMessage: 'Category page',
  },
  viewProductDetailPage: {
    id: 'Pages.viewProductDetailPage',
    defaultMessage: 'Product detail page',
  },
  viewSubDedicated: {
    id: 'Pages.viewSubDedicated',
    defaultMessage: 'Dedicated',
  },
  viewSubFallback: {
    id: 'Pages.viewSubFallback',
    defaultMessage: 'Fallback',
  },
  viewSubOverride: {
    id: 'Pages.viewSubOverride',
    defaultMessage: 'Override',
  },
  viewSubInheritsGlobal: {
    id: 'Pages.viewSubInheritsGlobal',
    defaultMessage: 'Inherits global',
  },
  // PDP-specific labels
  aboutThisPdp: {
    id: 'Pages.aboutThisPdp',
    defaultMessage: 'About the product detail page',
  },
  pdpAssignment: {
    id: 'Pages.pdpAssignment',
    defaultMessage: 'PDP assignment',
  },
  pdpTypeCategoryOverride: {
    id: 'Pages.pdpTypeCategoryOverride',
    defaultMessage: 'PDP — category override',
  },
  pdpTypeGlobalTemplate: {
    id: 'Pages.pdpTypeGlobalTemplate',
    defaultMessage: 'PDP — All categories fallback',
  },
  editPdpOverride: {
    id: 'Pages.editPdpOverride',
    defaultMessage: 'Edit PDP override',
  },
  editGlobalPdp: {
    id: 'Pages.editGlobalPdp',
    defaultMessage: 'Edit All categories PDP',
  },
  inheritedGlobalPdpTitle: {
    id: 'Pages.inheritedGlobalPdpTitle',
    defaultMessage: 'Inherits All categories PDP',
  },
  inheritedGlobalPdpDescription: {
    id: 'Pages.inheritedGlobalPdpDescription',
    defaultMessage:
      'Products in {category} currently render with the All categories PDP. Create an override to give them a category-specific layout.',
  },
  createOverride: {
    id: 'Pages.createOverride',
    defaultMessage: 'Create override',
  },
  forkedFromGlobalPdp: {
    id: 'Pages.forkedFromGlobalPdp',
    defaultMessage: 'Forked from All categories PDP',
  },
  assignmentSourceLabel: {
    id: 'Pages.assignmentSourceLabel',
    defaultMessage: 'Source',
  },
  // Delete assignment
  deletePageButton: {
    id: 'Pages.deletePageButton',
    defaultMessage: 'Delete',
  },
  deleteKindPdp: {
    id: 'Pages.deleteKindPdp',
    defaultMessage: 'PDP override',
  },
  deleteKindPlp: {
    id: 'Pages.deleteKindPlp',
    defaultMessage: 'dedicated category page',
  },
  deleteKindPage: {
    id: 'Pages.deleteKindPage',
    defaultMessage: 'page',
  },
  deleteAssignmentTitle: {
    id: 'Pages.deleteAssignmentTitle',
    defaultMessage: 'Delete this page?',
  },
  deleteAssignmentBody: {
    id: 'Pages.deleteAssignmentBody',
    defaultMessage:
      'This permanently removes the {kind} and cannot be undone. The storefront will fall back to its default.',
  },
  deleteAssignmentCancel: {
    id: 'Pages.deleteAssignmentCancel',
    defaultMessage: 'Cancel',
  },
  deleteAssignmentConfirm: {
    id: 'Pages.deleteAssignmentConfirm',
    defaultMessage: 'Delete page',
  },
  // New arbitrary page drawer
  contentPagesGroup: {
    id: 'Pages.contentPagesGroup',
    defaultMessage: 'Content pages',
  },
  newPageDrawerTitle: {
    id: 'Pages.newPageDrawerTitle',
    defaultMessage: 'Create a new page',
  },
  newPageNameLabel: {
    id: 'Pages.newPageNameLabel',
    defaultMessage: 'Name',
  },
  newPageNamePlaceholder: {
    id: 'Pages.newPageNamePlaceholder',
    defaultMessage: 'About us',
  },
  newPageUrlLabel: {
    id: 'Pages.newPageUrlLabel',
    defaultMessage: 'URL',
  },
  newPageUrlHint: {
    id: 'Pages.newPageUrlHint',
    defaultMessage:
      'A single-segment path, lowercase letters, numbers and hyphens (e.g. about-us).',
  },
  newPageResolvesTo: {
    id: 'Pages.newPageResolvesTo',
    defaultMessage: 'Resolves to {url}',
  },
  newPageErrorFormat: {
    id: 'Pages.newPageErrorFormat',
    defaultMessage:
      'Use lowercase letters, numbers and hyphens only — a single URL segment.',
  },
  newPageErrorReserved: {
    id: 'Pages.newPageErrorReserved',
    defaultMessage:
      'This URL conflicts with the home, category or product routes (or a reserved path).',
  },
  newPageErrorDuplicate: {
    id: 'Pages.newPageErrorDuplicate',
    defaultMessage: 'A page with this URL already exists.',
  },
  newPageCreate: {
    id: 'Pages.newPageCreate',
    defaultMessage: 'Create page',
  },
  newPageCancel: {
    id: 'Pages.newPageCancel',
    defaultMessage: 'Cancel',
  },
});
