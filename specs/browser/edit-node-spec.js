/*global describe, it, beforeEach, afterEach, expect, jasmine, spyOn, window, document, require */
const jQuery = require('jquery'),
	_ = require('underscore');

require('../../src/browser/edit-node');
require('../helpers/jquery-extension-matchers');

describe('editNode', function () {
	'use strict';
	let textBox, node, resolved, rejected;
	const triggerBlur = function (element) {
		const e = document.createEvent('Event');
		e.initEvent('blur', true, true);
		element.dispatchEvent(e);
	};
	beforeEach(function () {
		node = jQuery('<div>').data('title', 'some title').appendTo('body');
		textBox = jQuery('<div>').attr('data-mapjs-role', 'title').text('some old text').appendTo(node);
		spyOn(jQuery.fn, 'focus').and.callThrough();
		spyOn(jQuery.fn, 'shadowDraggable').and.callThrough();
		resolved = jasmine.createSpy('resolved');
		rejected = jasmine.createSpy('rejected');
		node.editNode().then(resolved, rejected);
	});
	it('makes the text box content editable', function () {
		expect(textBox.attr('contenteditable')).toBeTruthy();
	});
	it('fills the text box with the data title attribute', function () {
		expect(textBox.text()).toEqual('some title');
	});
	describe('break word control', function () {
		it('sets the word break to break-all if the original title is different from the text in the box  - this is to avoid long text normally hidden (eg links) messing up the layuot', function () {
			expect(textBox.css('word-break')).toBe('break-all');
		});

		it('clears the word break when the editing is completed', function () {
			//textBox.trigger('blur'); // complete previous edit
			triggerBlur(textBox[0]);
			expect(textBox).not.toHaveOwnStyle('word-break');

		});
		it('clears the word break when the editing is canceled', function () {
			textBox.trigger(jQuery.Event('keydown', { which: 27 }));
			expect(textBox).not.toHaveOwnStyle('word-break');
		});
		it('does not set the word break if the original title and the node text are the same', function () {
			triggerBlur(textBox[0]);
			textBox.text('some title');
			node.editNode();
			expect(textBox).not.toHaveOwnStyle('word-break');
		});
	});

	it('focuses on the text box', function () {
		expect(jQuery.fn.focus).toHaveBeenCalledOnJQueryObject(textBox);
	});
	it('deactivates dragging on the node', function () {
		expect(jQuery.fn.shadowDraggable).toHaveBeenCalledOnJQueryObject(node);
		expect(jQuery.fn.shadowDraggable).toHaveBeenCalledWith({disable: true});
	});
	it('puts the caret at the end of the textbox', function () {
		const selection = window.getSelection();
		expect(selection.type).toEqual('Caret');
		expect(selection.baseOffset).toEqual(10);
		expect(selection.extentOffset).toEqual(10);
		expect(selection.baseNode.parentElement).toEqual(textBox[0]);
		expect(selection.extentNode.parentElement).toEqual(textBox[0]);
	});
	it('does not resolve or reject the promise immediately', function () {
		expect(resolved).not.toHaveBeenCalled();
		expect(rejected).not.toHaveBeenCalled();
	});
	describe('event processing', function () {
		let options, event;
		beforeEach(function () {
			textBox.text('changed text');
		});
		it('completes editing when focus is lost', function () {
			triggerBlur(textBox[0]);
			expect(textBox.attr('contenteditable')).toBeFalsy();
			expect(resolved).toHaveBeenCalledWith('changed text');
		});
		it('consumes multi-line text', function () {
			textBox.html('changed\ntext');
			triggerBlur(textBox[0]);
			expect(resolved).toHaveBeenCalledWith('changed\ntext');
		});
		it('consumes broken firefox contenteditable multi-line text', function () {
			textBox.html('changed<br>text');
			triggerBlur(textBox[0]);
			expect(resolved).toHaveBeenCalledWith('changed\ntext');
		});
		it('converts text box content to text using innerText', function () {
			spyOn(jQuery.fn, 'innerText').and.returnValue('hello there');
			triggerBlur(textBox[0]);
			expect(resolved).toHaveBeenCalledWith('hello there');
		});
		it('reactivates dragging when focus is lost', function () {
			node.attr('mapjs-level', 2);
			jQuery.fn.shadowDraggable.calls.reset();
			triggerBlur(textBox[0]);
			expect(jQuery.fn.shadowDraggable).toHaveBeenCalledOnJQueryObject(node);
			expect(jQuery.fn.shadowDraggable.calls.mostRecent().args).toEqual([]);
		});
		it('completes editing when enter is pressed and prevents further keydown event propagation', function () {
			event = jQuery.Event('keydown', { which: 13 });
			textBox.trigger(event);
			expect(textBox.attr('contenteditable')).toBeFalsy();
			expect(resolved).toHaveBeenCalledWith('changed text');
			expect(event.isPropagationStopped()).toBeTruthy();
		});
		it('completes editing when tab is pressed, prevents the default to avoid focusing out, but does not prevents event propagation so stage can add a new node', function () {
			event = jQuery.Event('keydown', { which: 9 });
			textBox.trigger(event);
			expect(textBox.attr('contenteditable')).toBeFalsy();
			expect(resolved).toHaveBeenCalledWith('changed text');
			expect(event.isPropagationStopped()).toBeFalsy();
			expect(event.isDefaultPrevented()).toBeTruthy();
		});
		it('does not complete editing or prevent propagation if shift+enter is pressed - instead it lets the document handle the line break', function () {
			event = jQuery.Event('keydown', { which: 13, shiftKey: true });
			textBox.trigger(event);
			expect(textBox.attr('contenteditable')).toBeTruthy();
			expect(resolved).not.toHaveBeenCalled();
			expect(event.isPropagationStopped()).toBeFalsy();
		});
		it('cancels editing when escape is pressed, restoring original text and stops event propagation', function () {
			event = jQuery.Event('keydown', { which: 27 });
			textBox.trigger(event);
			expect(textBox.attr('contenteditable')).toBeFalsy();
			expect(rejected).toHaveBeenCalled();
			expect(event.isPropagationStopped()).toBeTruthy();
			expect(textBox.text()).toBe('some old text');
		});
		it('cancels editing if the text is not modified, even if the user did not press escape', function () {
			textBox.text('some title');
			triggerBlur(textBox[0]);
			expect(textBox.attr('contenteditable')).toBeFalsy();
			expect(rejected).toHaveBeenCalled();
			expect(textBox.text()).toBe('some old text');
		});
		_.each(['ctrl', 'meta'], function (specialKey) {
			it('stops editing but lets events propagate when ' + specialKey + ' +s is pressed so map can be saved', function () {
				options = { which: 83 };
				options[specialKey + 'Key'] = true;
				event = jQuery.Event('keydown', options);
				textBox.trigger(event);
				expect(textBox.attr('contenteditable')).toBeFalsy();
				expect(resolved).toHaveBeenCalledWith('changed text');
				expect(event.isPropagationStopped()).toBeFalsy();
				expect(event.isDefaultPrevented()).toBeTruthy();
			});
			it('does not cancel editing if text has changed and ' + specialKey + '+z pressed, but cancels propagation so the map does not get this keyclick as well', function () {
				options = { which: 90 };
				options[specialKey + 'Key'] = true;
				event = jQuery.Event('keydown', options);
				textBox.trigger(event);
				expect(textBox.attr('contenteditable')).toBeTruthy();
				expect(rejected).not.toHaveBeenCalled();
				expect(resolved).not.toHaveBeenCalled();
				expect(event.isPropagationStopped()).toBeTruthy();
			});
			it('cancels editing if text has not changed and ' + specialKey + '+z pressed, also cancels propagation so the map does not get this keyclick as well', function () {
				options = { which: 90 };
				options[specialKey + 'Key'] = true;
				textBox.text('some title');
				event = jQuery.Event('keydown', options);
				textBox.trigger(event);
				expect(textBox.attr('contenteditable')).toBeFalsy();
				expect(rejected).toHaveBeenCalled();
				expect(event.isPropagationStopped()).toBeTruthy();
			});
		});
	});
	afterEach(function () {
		node.remove();
	});
});

