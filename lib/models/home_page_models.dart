/// Response shape from the getHomePageData callable.
class HomePageData {
  const HomePageData({
    required this.weeklySummary,
    required this.weekRange,
    required this.assignments,
    required this.completed,
  });

  final WeeklySummary weeklySummary;
  final WeekRange weekRange;
  final List<HomeAssignment> assignments;
  final List<HomeCompletion> completed;

  factory HomePageData.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception('HomePageData expected a Map, got ${json.runtimeType}');
    }

    return HomePageData(
      weeklySummary: WeeklySummary.fromJson(json['weeklySummary'] ?? {}),
      weekRange: WeekRange.fromJson(json['weekRange'] ?? {}),
      assignments: (json['assignments'] as List?)?.map((e) => HomeAssignment.fromJson(e)).toList() ?? [],
      completed: (json['completed'] as List?)?.map((e) => HomeCompletion.fromJson(e)).toList() ?? []
    );
  }
}

class WeeklySummary {
  const WeeklySummary({
    required this.remainingCount,
    required this.totalCount,
  });

  final int remainingCount;
  final int totalCount;

  factory WeeklySummary.fromJson(dynamic json) {
    if (json == null || json is! Map) {
      return const WeeklySummary(remainingCount: 0, totalCount: 0);
    }
    return WeeklySummary(
      remainingCount: (json['remainingCount'] as num?)?.toInt() ?? 0,
      totalCount: (json['totalCount'] as num?)?.toInt() ?? 0
    );
  }
}

class WeekRange {
  const WeekRange({
    required this.start,
    required this.end,
    this.label,
  });

  final String start;
  final String end;
  final String? label;

  factory WeekRange.fromJson(dynamic json) {
    if (json == null || json is! Map) {
      return const WeekRange(start: '', end: '');
    }
    return WeekRange(
      start: (json['start'] as String?) ?? '',
      end: (json['end'] as String?) ?? '',
      label: json['label'] as String?,
    );
  }
}

class HomeAssignment {
  const HomeAssignment({
    required this.id,
    required this.type,
    required this.teacher,
    required this.dueDate,
    required this.totalQuestionCount,
    required this.completedQuestionCount,
    required this.buttonLabel,
  });

  final String id;
  final String type;
  final String teacher;
  final String dueDate;
  final int totalQuestionCount;
  final int completedQuestionCount;
  final String buttonLabel;

  factory HomeAssignment.fromJson(dynamic json) {
    if (json == null || json is! Map) {
      return const HomeAssignment(
        id: '',
        type: '',
        teacher: '',
        dueDate: '',
        totalQuestionCount: 0,
        completedQuestionCount: 0,
        buttonLabel: 'Start',
      );
    }
    return HomeAssignment(
      id: (json['id'] as String?) ?? '',
      type: (json['type'] as String?) ?? '',
      teacher: (json['teacher'] as String?) ?? '',
      dueDate: (json['dueDate'] as String?) ?? '',
      totalQuestionCount: (json['totalQuestionCount'] as num?)?.toInt() ?? 0,
      completedQuestionCount: (json['completedQuestionCount'] as num?)?.toInt() ?? 0,
      buttonLabel: (json['buttonLabel'] as String?) ?? 'Start',
    );
  }
}

class HomeCompletion {
  const HomeCompletion({
    required this.type,
    required this.teacher,
    required this.dueDate,
    required this.totalQuestionCount,
    required this.completedAt,
    this.subtitle,
  });

  final String type;
  final String teacher;
  final String dueDate;
  final int totalQuestionCount;
  final String completedAt;
  final String? subtitle;

  factory HomeCompletion.fromJson(dynamic json) {
    if (json == null || json is! Map) {
      return const HomeCompletion(
        type: '',
        teacher: '',
        dueDate: '',
        totalQuestionCount: 0,
        completedAt: '',
      );
    }
    return HomeCompletion(
      type: (json['type'] as String?) ?? '',
      teacher: (json['teacher'] as String?) ?? '',
      dueDate: (json['dueDate'] as String?) ?? '',
      totalQuestionCount: (json['totalQuestionCount'] as num?)?.toInt() ?? 0,
      completedAt: (json['completedAt'] as String?) ?? '',
      subtitle: json['subtitle'] as String?,
    );
  }
}
