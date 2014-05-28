/** @jsx React.DOM */

define([
  "React",
  "jsx!components/AppVersionComponent",
  "jsx!components/AppVersionListComponent",
  "jsx!components/ModalComponent",
  "jsx!components/TabPaneComponent",
  "jsx!components/TaskListComponent",
  "jsx!components/TogglableTabsComponent",
  "models/AppVersionCollection",
  "mixins/BackboneMixin"
], function(React, AppVersionComponent, AppVersionListComponent, ModalComponent,
    TabPaneComponent, TaskListComponent, TogglableTabsComponent,
    AppVersionCollection, BackboneMixin) {

  return React.createClass({
    displayName: "AppModalComponent",
    mixins: [BackboneMixin],

    destroy: function() {
      this.refs.modalComponent.destroy();
    },
    destroyApp: function() {
      if (confirm("Destroy app '" + this.props.model.get("id") + "'?\nThis is irreversible.")) {
        this.props.model.destroy();
        this.refs.modalComponent.destroy();
      }
    },
    fetchAppVersions: function() {
      var _this = this;
      var appVersions = this.state.appVersions;

      if (appVersions == null) {
        appVersions = new AppVersionCollection({appId: this.props.model.id});
      }

      appVersions.fetch({
        success: function() {
          _this.setState({appVersions: appVersions});
        }
      });
    },
    getResource: function() {
      return this.props.model;
    },
    getInitialState: function() {
      return {
        appVersions: null,
        selectedTasks: {}
      };
    },
    killSelectedTasks: function(options) {
      var _this = this;
      var _options = options || {};

      var selectedTaskIds = Object.keys(this.state.selectedTasks);
      var tasksToKill = this.props.model.tasks.filter(function(task) {
        return selectedTaskIds.indexOf(task.id) >= 0;
      });

      tasksToKill.forEach(function(task) {
        task.destroy({
          scale: _options.scale,
          success: function() {
            var instances;
            if (_options.scale) {
              instances = _this.props.model.get("instances");
              _this.props.model.set("instances", instances - 1);
            }

            delete _this.state.selectedTasks[task.id];

            // Force an update since React doesn't know a key was removed from
            // `selectedTasks`.
            _this.forceUpdate();
          },
          wait: true
        });
      });
    },
    killSelectedTasksAndScale: function() {
      this.killSelectedTasks({scale: true});
    },
    refreshTaskList: function() {
      this.refs.taskList.fetchTasks();
    },

    rollbackToAppVersion: function(appVersion) {
      var _this = this;

      appVersion.fetch({
        success: function() {
          _this.props.model.setAppVersion(appVersion);
          _this.props.model.save();
        }
      });
    },

    render: function() {
      var buttons;
      var model = this.props.model;
      var selectedTasksLength = Object.keys(this.state.selectedTasks).length;

      if (selectedTasksLength === 0) {
        buttons =
          <p>
            <button className="btn btn-sm btn-default" onClick={this.refreshTaskList}>
              ↻ Refresh
            </button>
          </p>;
      } else {
        // Killing two tasks in quick succession raises an exception. Disable
        // "Kill & Scale" if more than one task is selected to prevent the
        // exception from happening.
        //
        // TODO(ssorallen): Remove once
        //   https://github.com/mesosphere/marathon/issues/108 is addressed.
        buttons =
          <p class="btn-group">
            <button className="btn btn-sm btn-default" onClick={this.killSelectedTasks}>
              Kill
            </button>
            <button className="btn btn-sm btn-default" disabled={selectedTasksLength > 1}
                onClick={this.killSelectedTasksAndScale}>
              Kill &amp; Scale
            </button>
          </p>;
      }

      return (
        <ModalComponent ref="modalComponent" onDestroy={this.props.onDestroy} size="lg">
          <div className="modal-header">
             <button type="button" className="close"
                aria-hidden="true" onClick={this.destroy}>&times;</button>
            <h3 className="modal-title">{model.get("id")}</h3>
            <ul className="list-inline">
              <li>
                <span className="text-info">Instances </span>
                <span className="badge">{model.get("instances")}</span>
              </li>
              <li>
                <span className="text-info">CPUs </span>
                <span className="badge">{model.get("cpus")}</span>
              </li>
              <li>
                <span className="text-info">Memory </span>
                <span className="badge">{model.get("mem")} MB</span>
              </li>
            </ul>
          </div>
          <TogglableTabsComponent className="modal-body"
              tabs={[
                {id: "instances", text: "Instances"},
                {id: "configuration", text: "Configuration"}
              ]}>
            <TabPaneComponent id="instances">
              {buttons}
              <TaskListComponent collection={model.tasks}
                ref="taskList" selectedTasks={this.state.selectedTasks}
                onAllTasksToggle={this.toggleAllTasks}
                onTaskToggle={this.toggleTask} />
            </TabPaneComponent>
            <TabPaneComponent
                id="configuration"
                onActivate={this.fetchAppVersions}>
              <h4>Current Version</h4>
              <AppVersionComponent app={this.props.model} />
              <h4>Previous Versions</h4>
              <AppVersionListComponent
                app={this.props.model}
                appVersions={this.state.appVersions == null ? null : this.state.appVersions.slice(1)}
                onRollback={this.rollbackToAppVersion} />
            </TabPaneComponent>
          </TogglableTabsComponent>
          <div className="modal-footer">
            <button className="btn btn-sm btn-danger" onClick={this.destroyApp}>
              Destroy
            </button>
            <button className="btn btn-sm btn-default"
                onClick={this.suspendApp} disabled={this.props.model.get("instances") < 1}>
              Suspend
            </button>
            <button className="btn btn-sm btn-default" onClick={this.scaleApp}>
              Scale
            </button>
          </div>
        </ModalComponent>
      );
    },
    scaleApp: function() {
      var model = this.props.model;
      var instancesString = prompt("Scale to how many instances?",
        model.get("instances"));

      // Clicking "Cancel" in a prompt returns either null or an empty String.
      // perform the action only if a value is submitted.
      if (instancesString != null && instancesString !== "") {
        var instances = parseInt(instancesString, 10);
        model.save({instances: instances});

        if (model.validationError != null) {
          // If the model is not valid, revert the changes to prevent the UI
          // from showing an invalid state.
          model.set(model.previousAttributes());
          alert("Not scaling: " + model.validationError[0].message);
        }
      }
    },
    toggleAllTasks: function() {
      var newSelectedTasks = {};
      var modelTasks = this.props.model.tasks;

      // Note: not an **exact** check for all tasks being selected but a good
      // enough proxy.
      var allTasksSelected = Object.keys(this.state.selectedTasks).length ===
        modelTasks.length;

      if (!allTasksSelected) {
        modelTasks.forEach(function(task) { newSelectedTasks[task.id] = true; });
      }

      this.setState({selectedTasks: newSelectedTasks});
    },
    toggleTask: function(task, value) {
      var selectedTasks = this.state.selectedTasks;

      // If `toggleTask` is used as a callback for an event handler, the second
      // parameter will be an event object. Use it to set the value only if it
      // is a Boolean.
      var localValue = (typeof value === Boolean) ?
        value :
        !selectedTasks[task.id];

      if (localValue === true) {
        selectedTasks[task.id] = true;
      } else {
        delete selectedTasks[task.id];
      }

      this.setState({selectedTasks: selectedTasks});
    },
    suspendApp: function() {
      if (confirm("Suspend app by scaling to 0 instances?")) {
        this.props.model.suspend();
      }
    }
  });
});
