$ = jQuery.sub()

class Index extends App.Controller
  constructor: ->
    super

    # check authentication
    return if !@authenticate()

    new App.ControllerGenericIndex(
      el: @el,
      id: @id,
      genericObject: 'Group',
      pageData: {
        title: 'Groups',
        home: 'groups',
        object: 'Group',
        objects: 'Groups',
        navupdate: '#groups',
        notes: [
          'Groups are ...'
        ],
        buttons: [
          { name: 'New Group', 'data-type': 'new', class: 'primary' },
        ],
      },
    )

App.Config.set( 'groups', Index, 'Routes' )

App.Config.set( 'Group', { prio: 1500, parent: '#admin', name: 'Groups', target: '#groups', role: ['Admin'] }, 'NavBar' )
