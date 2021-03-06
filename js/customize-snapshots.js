/* global jQuery, _customizeSnapshots, JSON */
/* eslint-disable no-extra-parens */

( function( api, $ ) {
	'use strict';

	var component;

	if ( ! api.Snapshots ) {
		api.Snapshots = {};
	}

	component = api.Snapshots;

	component.data = {};

	if ( 'undefined' !== typeof _customizeSnapshots ) {
		_.extend( component.data, _customizeSnapshots );
	}

	/**
	 * Inject the functionality.
	 */
	component.init = function() {
		window._wpCustomizeControlsL10n.save = component.data.i18n.publish;
		window._wpCustomizeControlsL10n.saved = component.data.i18n.published;

		api.bind( 'ready', function() {
			if ( ! api.settings.theme.active || ( component.data.theme && component.data.theme !== api.settings.theme.stylesheet ) ) {
				return;
			}
			component.previewerQuery();
			component.addButton();

			$( '#snapshot-save' ).on( 'click', function( event ) {
				event.preventDefault();
				component.sendUpdateSnapshotRequest( event );
			} );

			if ( component.data.isPreview ) {
				api.state( 'saved' ).set( false );
				component.resetSavedStateQuietly();
			}
		} );

		api.bind( 'save', function( request ) {
			request.fail( function( response ) {
				var id = 'snapshot-dialog-error',
					snapshotDialogPublishError = wp.template( id );

				if ( response.responseText ) {

					// Insert the dialog error template.
					if ( 0 === $( '#' + id ).length ) {
						$( 'body' ).append( snapshotDialogPublishError( {
							title: component.data.i18n.publish,
							message: component.data.i18n.permsMsg
						} ) );
					}

					$( '#customize-header-actions .spinner' ).removeClass( 'is-active' );

					// Open the dialog.
					$( '#' + id ).dialog( {
						autoOpen: true,
						modal: true
					} );
				}
			} );
			return request;
		} );
	};

	/**
	 * Amend the preview query so we can update the snapshot during `customize_save`.
	 */
	component.previewerQuery = function() {
		var originalQuery = api.previewer.query;

		api.previewer.query = function() {
			var allCustomized = {},
				retval;

			retval = originalQuery.apply( this, arguments );

			if ( component.data.isPreview ) {
				api.each( function( value, key ) {
					allCustomized[ key ] = {
						'value': value(),
						'dirty': false
					};
				} );
				retval.snapshot_customized = JSON.stringify( allCustomized );
				retval.snapshot_uuid = component.data.uuid;
			}

			return retval;
		};
	};

	/**
	 * Create the snapshot share button.
	 */
	component.addButton = function() {
		var header = $( '#customize-header-actions' ),
			publishButton = header.find( '#save' ),
			snapshotButton, data;

		if ( header.length && 0 === header.find( '#snapshot-save' ).length ) {
			snapshotButton = wp.template( 'snapshot-save' );
			data = {
				buttonText: component.data.isPreview ? component.data.i18n.updateButton : component.data.i18n.saveButton
			};
			snapshotButton = $( $.trim( snapshotButton( data ) ) );
			if ( ! component.data.currentUserCanPublish ) {
				snapshotButton.attr( 'title', component.data.i18n.permsMsg );
				snapshotButton.addClass( 'button-primary' ).removeClass( 'button-secondary' );
			}
			snapshotButton.insertAfter( publishButton );
		}

		if ( ! component.data.currentUserCanPublish ) {
			publishButton.hide();
		}

		header.addClass( 'button-added' );
	};

	/**
	 * Silently update the saved state to be true without triggering the
	 * changed event so that the AYS beforeunload dialog won't appear
	 * if no settings have been changed after saving a snapshot. Note
	 * that it would be better if jQuery's callbacks allowed them to
	 * disabled and then re-enabled later, for example:
	 *   wp.customize.state.topics.change.disable();
	 *   wp.customize.state( 'saved' ).set( true );
	 *   wp.customize.state.topics.change.enable();
	 * But unfortunately there is no such enable method.
	 */
	component.resetSavedStateQuietly = function() {
		api.state( 'saved' )._value = true;
	};

	/**
	 * Make the AJAX request to update/save a snapshot.
	 *
	 * @param {object} event jQuery Event object
	 */
	component.sendUpdateSnapshotRequest = function( event ) {
		var spinner = $( '#customize-header-actions .spinner' ),
			scope = component.data.scope,
			request, customized;

		spinner.addClass( 'is-active' );

		customized = {};
		api.each( function( value, key ) {
			customized[ key ] = {
				'value': value(),
				'dirty': value._dirty
			};
		} );

		request = wp.ajax.post( 'customize_update_snapshot', {
			nonce: component.data.nonce,
			wp_customize: 'on',
			snapshot_customized: JSON.stringify( customized ),
			customize_snapshot_uuid: component.data.uuid,
			scope: scope,
			preview: ( component.data.isPreview ? 'on' : 'off' )
		} );

		request.done( function( response ) {
			var url = api.previewer.previewUrl(),
				regex = new RegExp( '([?&])customize_snapshot_uuid=.*?(&|$)', 'i' ),
				separator = url.indexOf( '?' ) !== -1 ? '&' : '?',
				header = $( '#customize-header-actions' ),
				customizeUrl = api.previewer.targetWindow.get().location.toString(),
				customizeSeparator = customizeUrl.indexOf( '?' ) !== -1 ? '&' : '?';

			// Set the UUID.
			if ( ! component.data.uuid ) {
				component.data.uuid = response.customize_snapshot_uuid;
			}

			if ( url.match( regex ) ) {
				url = url.replace( regex, '$1customize_snapshot_uuid=' + encodeURIComponent( component.data.uuid ) + '$2' );
			} else {
				url = url + separator + 'customize_snapshot_uuid=' + encodeURIComponent( component.data.uuid );
			}

			if ( 'full' === scope ) {
				url += '&scope=' + encodeURIComponent( scope );
			}

			// Change the save button text to update.
			if ( header.length && 0 !== header.find( '#snapshot-save' ).length ) {
				header.find( '#snapshot-save' ).text( component.data.i18n.updateButton );
			}

			spinner.removeClass( 'is-active' );
			component.resetSavedStateQuietly();

			// Replace the history state with an updated Customizer URL that includes the Snapshot UUID.
			if ( history.replaceState && ! customizeUrl.match( regex ) ) {
				customizeUrl += customizeSeparator + 'customize_snapshot_uuid=' + encodeURIComponent( component.data.uuid );
				if ( 'full' === scope ) {
					customizeUrl += '&scope=' + encodeURIComponent( scope );
				}
				history.replaceState( {}, document.title, customizeUrl );
			}

			// Open the preview in a new window on shift+click.
			if ( event.shiftKey ) {
				window.open( url, '_blank' );
			}

			// Trigger an event for plugins to use.
			api.trigger( 'customize-snapshots-update', {
				previewUrl: url,
				customizeUrl: customizeUrl,
				uuid: component.data.uuid
			} );
		} );

		request.fail( function() {
			var id = 'snapshot-dialog-error',
				snapshotDialogShareError = wp.template( id );

			// Insert the snapshot dialog error template.
			if ( 0 === $( '#' + id ).length ) {
				$( 'body' ).append( snapshotDialogShareError( {
					title: component.data.i18n.errorTitle,
					message: component.data.i18n.errorMsg
				} ) );
			}

			// Open the dialog.
			$( '#' + id ).dialog( {
				autoOpen: true,
				modal: true
			} );

			spinner.removeClass( 'is-active' );
		} );
	};

	component.init();

} )( wp.customize, jQuery );
