/**
 * @fileoverview Calendar for service.
 * @author NHN Ent. FE Development Team <dl_javascript@nhnent.com>
 */
'use strict';

var util = global.tui.util;
var datetime = require('../../common/datetime');
var Calendar = require('../../factory/calendar');
var DoorayBase = require('../controller/base');
var Week = require('../../controller/viewMixin/week');
var serviceWeekViewFactory = require('./weekView');

/**
 * @typedef {object} ServiceCalendar~Events
 * @property {string} [id] - 일정의 uniqueID.
 * @property {string} [calendarID] - 각 일정을 캘린더별로 그룹지을 수 있는 값.
 * @property {string} title - 이벤트 제목
 * @property {string} category - 이벤트 타입
 * @property {string} dueDateClass - 업무 일정 분류 (category가 'task'일 때 유효)
 * @property {string} starts - 일정 시작 시간
 * @property {string} ends - 일정 종료 시간
 * @property {string} [color] - 일정 텍스트색
 * @property {string} [bgColor] - 일정 배경색
 */

/**
 * Calendar factor module for service (dooray)
 * @constructor
 * @extends {Calendar}
 * @param {object} options - options for calendar
 *  @param {string} [options.cssPrefix] - CSS classname prefix
 *  @param {function} [options.groupFunc] - function for group event models {@see Collection#groupBy}
 *  @param {function} [options.controller] - controller instance
 *  @param {string} [options.defaultView='week'] - default view of calendar
 *  @param {object} [options.week] - options for week view
 *   @param {string} options.week.renderStartDate - YYYY-MM-DD render start date
 *   @param {string} options.week.renderEndDate - YYYY-MM-DD render end date
 *  @param {ServiceCalendar~Events[]} options.events - 기본 일정 목록
 *  @param {object} [options.month] - options for month view
 *  @param {string} options.month.renderMonth - YYYY-MM render month
 * @param {HTMLDivElement} container = container element for calendar
 */
function ServiceCalendar(options, container) {
    var controller;
    /**
     * 서비스에서 사용되는 모델 구분용 옵션 함수
     * @param {EventViewModel} viewModel - DoorayEvent를 래핑한 뷰 모델
     * @returns {string} 구분 키 값
     */
    options.groupFunc = function(viewModel) {
        return viewModel.model.category;
    };

    // 컨트롤러 만들기
    controller = options.controller = (function() {
        var controller = new DoorayBase(options),
            originFindByDateRange;

        // 주뷰 컨트롤러 믹스인
        controller.Week = {};
        util.forEach(Week, function(method, methodName) {
            controller.Week[methodName] = util.bind(method, controller);
        });

        // 일정 조회 API에 기존 캘린더에 없었던 milstone, task를 지원하도록
        // 하기 위해 메서드를 오버라이딩한다.
        originFindByDateRange = controller.Week.findByDateRange;
        controller.Week.findByDateRange = function(starts, ends) {
            var dateRange = util.map(datetime.range(
                    datetime.start(starts),
                    datetime.end(ends),
                    datetime.MILLISECONDS_PER_DAY
                ), function(d) { return datetime.format(d, 'YYYY-MM-DD'); }),
                viewModel = originFindByDateRange(starts, ends);

            util.forEach(viewModel, function(coll, key, obj) {
                var groupedByYMD;

                // 마일스톤, 업무 뷰 뷰모델 가공
                if (key === 'task' || key === 'milestone') {
                    groupedByYMD = coll.groupBy(dateRange, function(viewModel) {
                        return datetime.format(viewModel.model.ends, 'YYYY-MM-DD');
                    });

                    if (key === 'task') {
                        util.forEach(groupedByYMD, function(coll, ymd, obj) {
                            obj[ymd] = coll.groupBy(function(viewModel) {
                                return viewModel.model.dueDateClass;
                            });
                        });
                    }

                    obj[key] = groupedByYMD;
                }
            });

            return viewModel;
        };

        return controller;
    })();

    // FullCalendar 기본 모듈은 category, dueDateClass 플래그를 모름. 때문에
    // 이곳에서 이벤트 핸들러를 등록해서 일정 생성 전에 isAllDay플래그를 보고
    // category를 수동으로 지정해준다
    controller.on('beforeCreateEvent', function(e) {
        var data = e.data;

        if (!data.category) {
            data.category = data.isAllDay ? 'allday' : 'time';
        }
    });

    if (options.events) {
        controller.createEvents(options.events, true);
    }

    Calendar.call(this, options, container);
}

util.inherit(ServiceCalendar, Calendar);

/**
 * 각 뷰의 클릭 핸들러와 사용자 클릭 이벤트 핸들러를 잇기 위한 브릿지 개념의 이벤트 핸들러
 * @emits ServiceCalendar#click
 * @param {object} clickEventData - 'click' 핸들러의 이벤트 데이터
 */
ServiceCalendar.prototype._onClick = function(clickEventData) {
    /**
     * @events ServiceCalendar#click
     * @type {object}
     * @property {DoorayEvent} model - 클릭 이벤트 블록과 관련된 일정 모델 인스턴스
     */
    this.fire('click', clickEventData);
};

/**
 * 캘린더 팩토리 클래스와 주뷰, 월뷰의 이벤트 연결을 토글한다
 * @param {boolean} isAttach - true면 이벤트 연결함.
 * @param {Week|Month} view - 주뷰 또는 월뷰
 * @param {ServiceCalendar} calendar - 캘린더 팩토리 클래스
 */
ServiceCalendar.prototype._toggleViewEvent = function(isAttach, view, calendar) {
    var handlers = view.handlers;

    util.forEach(handlers.click, function(handler) {
        if (isAttach) {
            handler.on('click', calendar._onClick, calendar);
            return;
        }

        handler.off('click', calendar._onClick, calendar);
    });
};

/**
 * 주뷰, 월뷰 간 전환
 * @override
 * @param {string} viewName - 'week', 'month' 중 하나
 * @param {boolean} [force=false] - true 지정시 뷰 전환이 없어도 전환을 위한 동작을 수행한다
 */
ServiceCalendar.prototype.toggleView = function(viewName, force) {
    var layout = this.layout,
        controller = this.controller,
        dragHandler = this.dragHandler,
        options = this.options;

    if (!force && this.currentViewName === viewName) {
        return;
    }
    
    layout.childs.doWhenHas(viewName, function(view) {
        this._toggleViewEvent(false, view, this);
    }, this);
    layout.clear();

    if (viewName === 'week') {
        layout.addChild(function() {
            return serviceWeekViewFactory(controller, layout.container, dragHandler, options);
        });
    } else if (viewName === 'month') {
        //TODO: implements
        console.log('월뷰 전환');
    }

    layout.childs.doWhenHas(viewName, function(view) {
        this._toggleViewEvent(true, view, this);
    }, this);
    layout.render();

    this.currentViewName = viewName;
};

module.exports = ServiceCalendar;

