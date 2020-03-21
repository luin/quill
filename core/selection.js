import { LeafBlot, Scope } from 'parchment';
import clone from 'clone';
import equal from 'deep-equal';
import Emitter from './emitter';
import logger from './logger';

const computeScrollIntoView = (function() {
  function isElement(el) {
    return el != null && typeof el === 'object' && el.nodeType === 1;
  }

  function canOverflow(overflow, skipOverflowHiddenElements) {
    if (skipOverflowHiddenElements && overflow === 'hidden') {
      return false;
    }

    return overflow !== 'visible' && overflow !== 'clip';
  }

  function getFrameElement(el) {
    if (!el.ownerDocument || !el.ownerDocument.defaultView) {
      return null;
    }

    return el.ownerDocument.defaultView.frameElement;
  }

  function isHiddenByFrame(el) {
    var frame = getFrameElement(el);

    if (!frame) {
      return false;
    }

    return (
      frame.clientHeight < el.scrollHeight || frame.clientWidth < el.scrollWidth
    );
  }

  function isScrollable(el, skipOverflowHiddenElements) {
    if (el.clientHeight < el.scrollHeight || el.clientWidth < el.scrollWidth) {
      var style = getComputedStyle(el, null);
      return (
        canOverflow(style.overflowY, skipOverflowHiddenElements) ||
        canOverflow(style.overflowX, skipOverflowHiddenElements) ||
        isHiddenByFrame(el)
      );
    }

    return false;
  }

  function alignNearest(
    scrollingEdgeStart,
    scrollingEdgeEnd,
    scrollingSize,
    scrollingBorderStart,
    scrollingBorderEnd,
    elementEdgeStart,
    elementEdgeEnd,
    elementSize,
  ) {
    if (
      (elementEdgeStart < scrollingEdgeStart &&
        elementEdgeEnd > scrollingEdgeEnd) ||
      (elementEdgeStart > scrollingEdgeStart &&
        elementEdgeEnd < scrollingEdgeEnd)
    ) {
      return 0;
    }

    if (
      (elementEdgeStart <= scrollingEdgeStart &&
        elementSize <= scrollingSize) ||
      (elementEdgeEnd >= scrollingEdgeEnd && elementSize >= scrollingSize)
    ) {
      return elementEdgeStart - scrollingEdgeStart - scrollingBorderStart;
    }

    if (
      (elementEdgeEnd > scrollingEdgeEnd && elementSize < scrollingSize) ||
      (elementEdgeStart < scrollingEdgeStart && elementSize > scrollingSize)
    ) {
      return elementEdgeEnd - scrollingEdgeEnd + scrollingBorderEnd;
    }

    return 0;
  }

  return (bounds, target, options = {}) => {
    var scrollMode = options.scrollMode,
      block = options.block,
      inline = options.inline,
      boundary = options.boundary,
      skipOverflowHiddenElements = options.skipOverflowHiddenElements;
    var checkBoundary =
      typeof boundary === 'function'
        ? boundary
        : function(node) {
            return node !== boundary;
          };

    if (!isElement(target)) {
      throw new TypeError('Invalid target');
    }

    var scrollingElement =
      document.scrollingElement || document.documentElement;
    var frames = [];
    var cursor = target;

    while (isElement(cursor) && checkBoundary(cursor)) {
      cursor = cursor.parentNode;

      if (cursor === scrollingElement) {
        frames.push(cursor);
        break;
      }

      if (
        cursor === document.body &&
        isScrollable(cursor) &&
        !isScrollable(document.documentElement)
      ) {
        continue;
      }

      if (isScrollable(cursor, skipOverflowHiddenElements)) {
        frames.push(cursor);
      }
    }

    var viewportWidth = window.visualViewport
      ? visualViewport.width
      : innerWidth;
    var viewportHeight = window.visualViewport
      ? visualViewport.height
      : innerHeight;
    var viewportX = window.scrollX || pageXOffset;
    var viewportY = window.scrollY || pageYOffset;

    var _target$getBoundingCl = bounds,
      targetHeight = _target$getBoundingCl.height,
      targetWidth = _target$getBoundingCl.width,
      targetTop = _target$getBoundingCl.top,
      targetRight = _target$getBoundingCl.right,
      targetBottom = _target$getBoundingCl.bottom,
      targetLeft = _target$getBoundingCl.left;

    var targetBlock =
      block === 'start' || block === 'nearest'
        ? targetTop
        : block === 'end'
        ? targetBottom
        : targetTop + targetHeight / 2;
    var targetInline =
      inline === 'center'
        ? targetLeft + targetWidth / 2
        : inline === 'end'
        ? targetRight
        : targetLeft;
    var computations = [];

    for (var index = 0; index < frames.length; index++) {
      var frame = frames[index];

      var _frame$getBoundingCli = frame.getBoundingClientRect(),
        height = _frame$getBoundingCli.height,
        width = _frame$getBoundingCli.width,
        top = _frame$getBoundingCli.top,
        right = _frame$getBoundingCli.right,
        bottom = _frame$getBoundingCli.bottom,
        left = _frame$getBoundingCli.left;

      if (
        scrollMode === 'if-needed' &&
        targetTop >= 0 &&
        targetLeft >= 0 &&
        targetBottom <= viewportHeight &&
        targetRight <= viewportWidth &&
        targetTop >= top &&
        targetBottom <= bottom &&
        targetLeft >= left &&
        targetRight <= right
      ) {
        return computations;
      }

      var frameStyle = getComputedStyle(frame);
      var borderLeft = parseInt(frameStyle.borderLeftWidth, 10);
      var borderTop = parseInt(frameStyle.borderTopWidth, 10);
      var borderRight = parseInt(frameStyle.borderRightWidth, 10);
      var borderBottom = parseInt(frameStyle.borderBottomWidth, 10);
      var blockScroll = 0;
      var inlineScroll = 0;
      var scrollbarWidth =
        'offsetWidth' in frame
          ? frame.offsetWidth - frame.clientWidth - borderLeft - borderRight
          : 0;
      var scrollbarHeight =
        'offsetHeight' in frame
          ? frame.offsetHeight - frame.clientHeight - borderTop - borderBottom
          : 0;

      if (scrollingElement === frame) {
        if (block === 'start') {
          blockScroll = targetBlock;
        } else if (block === 'end') {
          blockScroll = targetBlock - viewportHeight;
        } else if (block === 'nearest') {
          blockScroll = alignNearest(
            viewportY,
            viewportY + viewportHeight,
            viewportHeight,
            borderTop,
            borderBottom,
            viewportY + targetBlock,
            viewportY + targetBlock + targetHeight,
            targetHeight,
          );
        } else {
          blockScroll = targetBlock - viewportHeight / 2;
        }

        if (inline === 'start') {
          inlineScroll = targetInline;
        } else if (inline === 'center') {
          inlineScroll = targetInline - viewportWidth / 2;
        } else if (inline === 'end') {
          inlineScroll = targetInline - viewportWidth;
        } else {
          inlineScroll = alignNearest(
            viewportX,
            viewportX + viewportWidth,
            viewportWidth,
            borderLeft,
            borderRight,
            viewportX + targetInline,
            viewportX + targetInline + targetWidth,
            targetWidth,
          );
        }

        blockScroll = Math.max(0, blockScroll + viewportY);
        inlineScroll = Math.max(0, inlineScroll + viewportX);
      } else {
        if (block === 'start') {
          blockScroll = targetBlock - top - borderTop;
        } else if (block === 'end') {
          blockScroll = targetBlock - bottom + borderBottom + scrollbarHeight;
        } else if (block === 'nearest') {
          blockScroll = alignNearest(
            top,
            bottom,
            height,
            borderTop,
            borderBottom + scrollbarHeight,
            targetBlock,
            targetBlock + targetHeight,
            targetHeight,
          );
        } else {
          blockScroll = targetBlock - (top + height / 2) + scrollbarHeight / 2;
        }

        if (inline === 'start') {
          inlineScroll = targetInline - left - borderLeft;
        } else if (inline === 'center') {
          inlineScroll = targetInline - (left + width / 2) + scrollbarWidth / 2;
        } else if (inline === 'end') {
          inlineScroll = targetInline - right + borderRight + scrollbarWidth;
        } else {
          inlineScroll = alignNearest(
            left,
            right,
            width,
            borderLeft,
            borderRight + scrollbarWidth,
            targetInline,
            targetInline + targetWidth,
            targetWidth,
          );
        }

        var scrollLeft = frame.scrollLeft,
          scrollTop = frame.scrollTop;
        blockScroll = Math.max(
          0,
          Math.min(
            scrollTop + blockScroll,
            frame.scrollHeight - height + scrollbarHeight,
          ),
        );
        inlineScroll = Math.max(
          0,
          Math.min(
            scrollLeft + inlineScroll,
            frame.scrollWidth - width + scrollbarWidth,
          ),
        );
        targetBlock += scrollTop - blockScroll;
        targetInline += scrollLeft - inlineScroll;
      }

      computations.push({
        el: frame,
        top: blockScroll,
        left: inlineScroll,
      });
    }

    return computations;
  };
})();

const debug = logger('quill:selection');

class Range {
  constructor(index, length = 0) {
    this.index = index;
    this.length = length;
  }
}

class Selection {
  constructor(scroll, emitter) {
    this.emitter = emitter;
    this.scroll = scroll;
    this.composing = false;
    this.mouseDown = false;
    this.root = this.scroll.domNode;
    this.cursor = this.scroll.create('cursor', this);
    // savedRange is last non-null range
    this.savedRange = new Range(0, 0);
    this.lastRange = this.savedRange;
    this.handleComposition();
    this.handleDragging();
    this.emitter.listenDOM('selectionchange', document, () => {
      if (!this.mouseDown && !this.composing) {
        setTimeout(this.update.bind(this, Emitter.sources.USER), 1);
      }
    });
    this.emitter.on(Emitter.events.SCROLL_BEFORE_UPDATE, () => {
      if (!this.hasFocus()) return;
      const native = this.getNativeRange();
      if (native == null) return;
      if (native.start.node === this.cursor.textNode) return; // cursor.restore() will handle
      this.emitter.once(Emitter.events.SCROLL_UPDATE, () => {
        try {
          if (
            this.root.contains(native.start.node) &&
            this.root.contains(native.end.node)
          ) {
            this.setNativeRange(
              native.start.node,
              native.start.offset,
              native.end.node,
              native.end.offset,
            );
          }
          this.update(Emitter.sources.SILENT);
        } catch (ignored) {
          // ignore
        }
      });
    });
    this.emitter.on(Emitter.events.SCROLL_OPTIMIZE, (mutations, context) => {
      if (context.range) {
        const { startNode, startOffset, endNode, endOffset } = context.range;
        this.setNativeRange(startNode, startOffset, endNode, endOffset);
        this.update(Emitter.sources.SILENT);
      }
    });
    this.update(Emitter.sources.SILENT);
  }

  handleComposition() {
    this.root.addEventListener('compositionstart', () => {
      this.composing = true;
      this.scroll.batchStart();
    });
    this.root.addEventListener('compositionend', () => {
      this.scroll.batchEnd();
      this.composing = false;
      if (this.cursor.parent) {
        const range = this.cursor.restore();
        if (!range) return;
        setTimeout(() => {
          this.setNativeRange(
            range.startNode,
            range.startOffset,
            range.endNode,
            range.endOffset,
          );
        }, 1);
      }
    });
  }

  handleDragging() {
    this.emitter.listenDOM('mousedown', document.body, () => {
      this.mouseDown = true;
    });
    this.emitter.listenDOM('mouseup', document.body, () => {
      this.mouseDown = false;
      this.update(Emitter.sources.USER);
    });
  }

  focus() {
    if (this.hasFocus()) return;
    this.root.focus();
    this.setRange(this.savedRange);
  }

  format(format, value) {
    this.scroll.update();
    const nativeRange = this.getNativeRange();
    if (
      nativeRange == null ||
      !nativeRange.native.collapsed ||
      this.scroll.query(format, Scope.BLOCK)
    )
      return;
    if (nativeRange.start.node !== this.cursor.textNode) {
      const blot = this.scroll.find(nativeRange.start.node, false);
      if (blot == null) return;
      // TODO Give blot ability to not split
      if (blot instanceof LeafBlot) {
        const after = blot.split(nativeRange.start.offset);
        blot.parent.insertBefore(this.cursor, after);
      } else {
        blot.insertBefore(this.cursor, nativeRange.start.node); // Should never happen
      }
      this.cursor.attach();
    }
    this.cursor.format(format, value);
    this.scroll.optimize();
    this.setNativeRange(this.cursor.textNode, this.cursor.textNode.data.length);
    this.update();
  }

  getBounds(index, length = 0) {
    const scrollLength = this.scroll.length();
    index = Math.min(index, scrollLength - 1);
    length = Math.min(index + length, scrollLength - 1) - index;
    let node;
    let [leaf, offset] = this.scroll.leaf(index);
    if (leaf == null) return null;
    [node, offset] = leaf.position(offset, true);
    const range = document.createRange();
    if (length > 0) {
      range.setStart(node, offset);
      [leaf, offset] = this.scroll.leaf(index + length);
      if (leaf == null) return null;
      [node, offset] = leaf.position(offset, true);
      range.setEnd(node, offset);
      return range.getBoundingClientRect();
    }
    let side = 'left';
    let rect;
    if (node instanceof Text) {
      if (offset < node.data.length) {
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
      } else {
        range.setStart(node, offset - 1);
        range.setEnd(node, offset);
        side = 'right';
      }
      rect = range.getBoundingClientRect();
    } else {
      rect = leaf.domNode.getBoundingClientRect();
      if (offset > 0) side = 'right';
    }
    return {
      bottom: rect.top + rect.height,
      height: rect.height,
      left: rect[side],
      right: rect[side],
      top: rect.top,
      width: 0,
    };
  }

  getNativeRange() {
    const selection = document.getSelection();
    if (selection == null || selection.rangeCount <= 0) return null;
    const nativeRange = selection.getRangeAt(0);
    if (nativeRange == null) return null;
    const range = this.normalizeNative(nativeRange);
    debug.info('getNativeRange', range);
    return range;
  }

  getRange() {
    const normalized = this.getNativeRange();
    if (normalized == null) return [null, null];
    const range = this.normalizedToRange(normalized);
    return [range, normalized];
  }

  hasFocus() {
    return (
      document.activeElement === this.root ||
      contains(this.root, document.activeElement)
    );
  }

  normalizedToRange(range) {
    const positions = [[range.start.node, range.start.offset]];
    if (!range.native.collapsed) {
      positions.push([range.end.node, range.end.offset]);
    }
    const indexes = positions.map(position => {
      const [node, offset] = position;
      const blot = this.scroll.find(node, true);
      const index = blot.offset(this.scroll);
      if (offset === 0) {
        return index;
      }
      if (blot instanceof LeafBlot) {
        return index + blot.index(node, offset);
      }
      return index + blot.length();
    });
    const end = Math.min(Math.max(...indexes), this.scroll.length() - 1);
    const start = Math.min(end, ...indexes);
    return new Range(start, end - start);
  }

  normalizeNative(nativeRange) {
    if (
      !contains(this.root, nativeRange.startContainer) ||
      (!nativeRange.collapsed && !contains(this.root, nativeRange.endContainer))
    ) {
      return null;
    }
    const range = {
      start: {
        node: nativeRange.startContainer,
        offset: nativeRange.startOffset,
      },
      end: { node: nativeRange.endContainer, offset: nativeRange.endOffset },
      native: nativeRange,
    };
    [range.start, range.end].forEach(position => {
      let { node, offset } = position;
      while (!(node instanceof Text) && node.childNodes.length > 0) {
        if (node.childNodes.length > offset) {
          node = node.childNodes[offset];
          offset = 0;
        } else if (node.childNodes.length === offset) {
          node = node.lastChild;
          if (node instanceof Text) {
            offset = node.data.length;
          } else if (node.childNodes.length > 0) {
            // Container case
            offset = node.childNodes.length;
          } else {
            // Embed case
            offset = node.childNodes.length + 1;
          }
        } else {
          break;
        }
      }
      position.node = node;
      position.offset = offset;
    });
    return range;
  }

  rangeToNative(range) {
    const indexes = range.collapsed
      ? [range.index]
      : [range.index, range.index + range.length];
    const args = [];
    const scrollLength = this.scroll.length();
    indexes.forEach((index, i) => {
      index = Math.min(scrollLength - 1, index);
      const [leaf, leafOffset] = this.scroll.leaf(index);
      const [node, offset] = leaf.position(leafOffset, i !== 0);
      args.push(node, offset);
    });
    if (args.length < 2) {
      return args.concat(args);
    }
    return args;
  }

  scrollIntoView(scrollingContainer) {
    const range = this.lastRange;
    if (range == null) return;
    const bounds = this.getBounds(range.index, range.length);
    if (bounds == null) return;
    const limit = this.scroll.length() - 1;
    const [first] = this.scroll.line(Math.min(range.index, limit));
    let last = first;
    if (range.length > 0) {
      [last] = this.scroll.line(Math.min(range.index + range.length, limit));
    }
    if (first == null || last == null) return;
    const computations = computeScrollIntoView(bounds, this.scroll.domNode, {
      scrollMode: 'if-needed',
      block: 'nearest',
      inline: 'nearest',
    });

    computations.forEach(({ el, top }) => {
      el.scrollTop = top;
    });
  }

  setNativeRange(
    startNode,
    startOffset,
    endNode = startNode,
    endOffset = startOffset,
    force = false,
  ) {
    debug.info('setNativeRange', startNode, startOffset, endNode, endOffset);
    if (
      startNode != null &&
      (this.root.parentNode == null ||
        startNode.parentNode == null ||
        endNode.parentNode == null)
    ) {
      return;
    }
    const selection = document.getSelection();
    if (selection == null) return;
    if (startNode != null) {
      if (!this.hasFocus()) this.root.focus();
      const { native } = this.getNativeRange() || {};
      if (
        native == null ||
        force ||
        startNode !== native.startContainer ||
        startOffset !== native.startOffset ||
        endNode !== native.endContainer ||
        endOffset !== native.endOffset
      ) {
        if (startNode.tagName === 'BR') {
          startOffset = Array.from(startNode.parentNode.childNodes).indexOf(
            startNode,
          );
          startNode = startNode.parentNode;
        }
        if (endNode.tagName === 'BR') {
          endOffset = Array.from(endNode.parentNode.childNodes).indexOf(
            endNode,
          );
          endNode = endNode.parentNode;
        }
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } else {
      selection.removeAllRanges();
      this.root.blur();
    }
  }

  setRange(range, force = false, source = Emitter.sources.API) {
    if (typeof force === 'string') {
      source = force;
      force = false;
    }
    debug.info('setRange', range);
    if (range != null) {
      const args = this.rangeToNative(range);
      this.setNativeRange(...args, force);
    } else {
      this.setNativeRange(null);
    }
    this.update(source);
  }

  update(source = Emitter.sources.USER) {
    const oldRange = this.lastRange;
    const [lastRange, nativeRange] = this.getRange();
    this.lastRange = lastRange;
    if (this.lastRange != null) {
      this.savedRange = this.lastRange;
    }
    if (!equal(oldRange, this.lastRange)) {
      if (
        !this.composing &&
        nativeRange != null &&
        nativeRange.native.collapsed &&
        nativeRange.start.node !== this.cursor.textNode
      ) {
        const range = this.cursor.restore();
        if (range) {
          this.setNativeRange(
            range.startNode,
            range.startOffset,
            range.endNode,
            range.endOffset,
          );
        }
      }
      const args = [
        Emitter.events.SELECTION_CHANGE,
        clone(this.lastRange),
        clone(oldRange),
        source,
      ];
      this.emitter.emit(Emitter.events.EDITOR_CHANGE, ...args);
      if (source !== Emitter.sources.SILENT) {
        this.emitter.emit(...args);
      }
    }
  }
}

function contains(parent, descendant) {
  try {
    // Firefox inserts inaccessible nodes around video elements
    descendant.parentNode; // eslint-disable-line no-unused-expressions
  } catch (e) {
    return false;
  }
  return parent.contains(descendant);
}

export { Range, Selection as default };
