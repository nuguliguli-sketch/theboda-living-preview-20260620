# Minimal SketchUp Ruby API mock: runs a generated builder script outside SketchUp to catch
# Ruby-level errors (typos, wrong arity, nil handling). It does not model SketchUp geometry.
class Numeric
  def mm; self / 25.4; end
end

module Geom
  class Point3d
    attr_reader :x, :y, :z
    def initialize(x, y, z); @x, @y, @z = x.to_f, y.to_f, z.to_f; end
    def -(o); Vector3d.new(x - o.x, y - o.y, z - o.z); end
  end
  class Vector3d
    attr_reader :x, :y, :z
    def initialize(x, y, z); @x, @y, @z = x.to_f, y.to_f, z.to_f; end
    def dot(o); x * o.x + y * o.y + z * o.z; end
    def cross(o); Vector3d.new(y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x); end
    def reverse; Vector3d.new(-x, -y, -z); end
  end
end

module Sketchup
  STATS = Hash.new(0)
  class Entity
    def valid?; !@erased; end
    def erase!; @erased = true; end
    attr_accessor :layer, :material, :name
  end
  class Edge < Entity
    def faces; []; end
  end
  class Face < Entity
    attr_reader :normal
    def initialize(pts)
      raise ArgumentError, "face needs >=3 points" if pts.size < 3
      raise ArgumentError, "points must be Point3d" unless pts.all? { |p| p.is_a?(Geom::Point3d) }
      n = Geom::Vector3d.new(0, 0, 0)
      pts.each_with_index do |p, i|
        q = pts[(i + 1) % pts.size]
        n = Geom::Vector3d.new(n.x + (p.y - q.y) * (p.z + q.z), n.y + (p.z - q.z) * (p.x + q.x), n.z + (p.x - q.x) * (p.y + q.y))
      end
      @normal = n
      STATS[:faces] += 1
    end
    def reverse!; @normal = @normal.reverse; STATS[:reversed] += 1; self; end
  end
  class Entities
    def initialize; @list = []; end
    def add_group; g = Group.new; @list << g; STATS[:groups] += 1; g; end
    def add_face(pts); f = Face.new(pts); @list << f; f; end
    def add_dimension_linear(a, b, off)
      raise ArgumentError unless a.is_a?(Geom::Point3d) && b.is_a?(Geom::Point3d) && off.is_a?(Geom::Vector3d)
      STATS[:dims] += 1; Entity.new
    end
    def grep(k); @list.grep(k); end
    def erase_entities(l); l.each(&:erase!); end
  end
  class Group < Entity
    def entities; @e ||= Entities.new; end
    def manifold?; true; end
  end
  class Color
    def initialize(r, g, b); raise ArgumentError unless [r, g, b].all? { |c| (0..255).cover?(c) }; end
  end
  class Material
    attr_accessor :color, :alpha
  end
  class Materials
    def initialize; @h = {}; end
    def [](n); @h[n]; end
    def add(n); @h[n] = Material.new; end
  end
  class Layers
    def initialize; @h = {}; end
    def [](n); @h[n]; end
    def add(n); @h[n] = Entity.new; end
  end
  class View; def zoom_extents; end; end
  class Model
    attr_reader :materials, :layers, :active_entities, :options, :active_view
    def initialize
      @materials, @layers, @active_entities = Materials.new, Layers.new, Entities.new
      @options = { "UnitsOptions" => {} }
      @active_view = View.new
    end
    def start_operation(n, d); @op = n; end
    def commit_operation; raise "no op" unless @op; end
    def save(p); STATS[:saved] = p; true; end
  end
  def self.active_model; @m ||= Model.new; end
end

module UI
  def self.savepanel(*a); "/tmp/x.skp"; end
  def self.messagebox(*a); end
end

load ARGV[0]
puts "[mock] OK #{Sketchup::STATS.inspect}"
