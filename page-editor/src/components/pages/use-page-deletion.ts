import { useState } from 'react';
import { useIntl } from 'react-intl';
import { usePageDeleter } from '../../hooks/use-page-builder-connector';
import { findPageById } from '../page-builder/page-tree';
import type { PageNode } from '../page-builder/types';
import messages from './messages';

type Args = {
  node: PageNode;
  pageTree: PageNode[];
  onSelectPage: (n: PageNode) => void;
  isCategory: boolean;
  view: 'plp' | 'pdp';
  pdpOverrideId: string;
  pdpOverrideDraft: { ctVersion: number | null };
  draftFetcher: { ctVersion: number | null };
  pdpOverrideState: 'published' | 'draft' | null;
  builderState: 'published' | 'draft' | null;
};

/**
 * Deleting the page object behind the current view. Which object that is
 * depends on the PLP/PDP switch, so the deleter, its version and the
 * confirmation copy are all resolved together. Removing it clears the
 * assignment and the storefront falls back to its default.
 */
export const usePageDeletion = ({
  node,
  pageTree,
  onSelectPage,
  isCategory,
  view,
  pdpOverrideId,
  pdpOverrideDraft,
  draftFetcher,
  pdpOverrideState,
  builderState,
}: Args) => {
  const intl = useIntl();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deleters for the PLP (this node's page) and the PDP override, so a delete
  // clears the assignment and the storefront falls back to its default.
  const plpDeleter = usePageDeleter(node.id);
  const pdpDeleter = usePageDeleter(pdpOverrideId);

  const isPdpView = isCategory && view === 'pdp';
  const deleteTargetDeleter = isPdpView ? pdpDeleter : plpDeleter;
  const deleteTargetVersion = isPdpView
    ? pdpOverrideDraft.ctVersion
    : draftFetcher.ctVersion;
  const canDelete = isPdpView
    ? pdpOverrideState !== null
    : builderState !== null;
  const deleteKind = isPdpView
    ? intl.formatMessage(messages.deleteKindPdp)
    : isCategory
    ? intl.formatMessage(messages.deleteKindPlp)
    : intl.formatMessage(messages.deleteKindPage);

  const handleConfirmDelete = async () => {
    setError(null);
    try {
      await deleteTargetDeleter.deletePage(deleteTargetVersion);
      setIsOpen(false);
      // An arbitrary page no longer exists anywhere — jump back to Home.
      if (!isCategory) {
        const home = findPageById(pageTree, 'home');
        if (home) onSelectPage(home);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return {
    isOpen,
    setIsOpen,
    error,
    setError,
    isPdpView,
    canDelete,
    deleteKind,
    deleting: deleteTargetDeleter.loading,
    confirmDelete: handleConfirmDelete,
  };
};
